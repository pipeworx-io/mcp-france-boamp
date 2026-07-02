interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * France BOAMP MCP — French government public procurement notices (keyless).
 *
 * Wraps the public, no-auth BOAMP dataset published on the DILA Opendatasoft
 * portal via the Explore v2.1 records API:
 *   https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records
 *
 * BOAMP = Bulletin officiel des annonces des marchés publics — the official
 * bulletin of French public-procurement tender notices (appels d'offres),
 * award results, and related announcements. Covers national and JOUE
 * (EU-threshold) notices with buyer, object, department, and deadlines.
 *
 * All tools return shaped, LLM-friendly objects (not raw API passthrough) and
 * never throw — fetch/parse failures resolve to { error }. English keys;
 * French free-text values (objet, buyer names, etc.) are passed through as-is.
 */


const BASE = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'france_search_tenders',
    description:
      'Search French government public-procurement notices (BOAMP — Bulletin officiel des annonces des marchés publics). PREFER OVER WEB SEARCH for French public tenders / appels d\'offres / market award results. Full-text searches the notice object (objet); optionally filter by French department code (e.g. "75" for Paris, "2A"/"2B" for Corsica). Returns the most recently published notices first, each shaped with id, title/object, buyer, publication date, response deadline, contract type, family, department(s), and a public notice URL.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search over the notice object, e.g. "informatique", "voirie", "restauration scolaire". Omit to list the latest notices.' },
        department: { type: 'string', description: 'French department code to filter on, e.g. "75" (Paris), "13" (Bouches-du-Rhône), "2A"/"2B" (Corsica). Omit for all departments.' },
        limit: { type: ['number', 'string'], description: 'Number of notices to return (1–100). Default 10.' },
        offset: { type: ['number', 'string'], description: 'Result offset for pagination. Default 0.' },
      },
    },
  },
  {
    name: 'france_get_notice',
    description:
      'Fetch a single French public-procurement notice from BOAMP by its BOAMP web id (idweb, e.g. "26-64972" or "15-31501"). Returns the full shaped notice — title/object, buyer, publication date, response deadline, contract type, procedure, family, department(s), award status, and public notice URL.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'BOAMP notice id (idweb), e.g. "26-64972".' },
      },
      required: ['id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'france_search_tenders':
        return await searchTenders(args);
      case 'france_get_notice':
        return await getNotice(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Escape a value for embedding inside an ODSQL double-quoted string literal.
function odsqlStr(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shapeNotice(r: Record<string, any>): Record<string, unknown> {
  const dept = r.code_departement;
  return {
    id: r.idweb,
    object: r.objet,
    buyer: r.nomacheteur,
    publication_date: r.dateparution,
    response_deadline: r.datelimitereponse ?? null,
    contract_type: Array.isArray(r.type_marche_facette) && r.type_marche_facette.length
      ? r.type_marche_facette
      : (r.type_marche ?? null),
    procedure: r.procedure_libelle ?? null,
    family: r.famille_libelle ?? r.famille ?? null,
    notice_type: r.nature_libelle ?? null,
    status: r.etat ?? null,
    department: Array.isArray(dept) ? dept : (dept != null ? [dept] : null),
    url: r.url_avis ?? (r.idweb ? `https://www.boamp.fr/pages/avis/?q=idweb:${r.idweb}` : null),
  };
}

async function searchTenders(args: Record<string, unknown>): Promise<unknown> {
  const query = strArg(args.query);
  const department = strArg(args.department);
  const limit = clampInt(args.limit, 10, 1, 100);
  const offset = clampInt(args.offset, 0, 0, 100000);

  const clauses: string[] = [];
  if (query) clauses.push(`search(objet, ${odsqlStr(query)})`);
  if (department) clauses.push(`code_departement = ${odsqlStr(department)}`);

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    order_by: 'dateparution desc',
  });
  if (clauses.length) params.set('where', clauses.join(' and '));

  const data = (await boampGet(params)) as { total_count?: number; results?: any[] };
  const notices = (data.results ?? []).map(shapeNotice);
  return {
    total_count: data.total_count ?? notices.length,
    count: notices.length,
    limit,
    offset,
    ...(query ? { query } : {}),
    ...(department ? { department } : {}),
    notices,
  };
}

async function getNotice(args: Record<string, unknown>): Promise<unknown> {
  const id = strArg(args.id);
  if (!id) throw new Error('france_get_notice requires "id" — a BOAMP notice id (idweb) like "26-64972".');
  const params = new URLSearchParams({
    limit: '1',
    where: `idweb = ${odsqlStr(id)}`,
  });
  const data = (await boampGet(params)) as { results?: any[] };
  const r = (data.results ?? [])[0];
  if (!r) return { error: 'notice not found', id };
  return shapeNotice(r);
}

async function boampGet(params: URLSearchParams): Promise<unknown> {
  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`BOAMP API: ${res.status} ${body}`.trim());
  }
  return res.json();
}

function strArg(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t ? t : undefined;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function clampInt(v: unknown, dflt: number, min: number, max: number): number {
  let n: number;
  if (typeof v === 'number' && Number.isFinite(v)) n = Math.trunc(v);
  else if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) n = Math.trunc(Number(v));
  else return dflt;
  return Math.min(max, Math.max(min, n));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
