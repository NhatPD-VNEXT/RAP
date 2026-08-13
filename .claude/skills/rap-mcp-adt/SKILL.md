---
name: rap-mcp-adt
description: Use when reading/creating/verifying SAP objects via the sap-adt MCP — ABAP classes, CDS (DDLS), RAP behavior (BDEF/behavior pool), service definition/binding (SRVD/SRVB), tables; exploring packages, name-collision/search (search_objects, grep_package, find_references), checking syntax, running ABAP Unit, previewing CDS/SQL data, where-used, version diffs, release-state (api_release_state), or profiling why ABAP/CDS/RAP is slow. ABAP Cloud / S/4HANA Public Cloud. Trigger on 'sap-adt', 'rap-mcp-adt', 'get_source', 'create_object', 'update_source', 'activate', 'api_release_state', 'name collision', 'release-state', 'search_objects', 'grep_package'.
---

# SAP ABAP via the sap-adt MCP

Drive a SAP system over ADT through the `sap-adt` MCP server. Tools are exposed
as `mcp__sap-adt__<tool>`. Every tool takes a `system` argument.

## Always first
1. `list_systems` → get the exact system name (e.g. `sap-vnext`). **Every** tool
   needs `system`; an unknown name returns a clear error listing valid ones.
2. If a call returns **"session expired … refresh cookies"** → call
   `refresh_cookies_for(system)` once, then retry. It runs a **headless login
   with the system's stored username/password** (offloaded to a worker thread,
   so it no longer crashes with *"Playwright Sync API inside the asyncio loop"*).
   It works **only** when credentials are stored; a cookie/browser-login system
   with no stored password returns *"needs username and password"* → the user
   must re-login from the web admin instead (its refresh can open an interactive
   browser, which needs a desktop — on a headless service host, do it over RDP:
   `Stop-Service adt-mcp` → run foreground → browser login → `Start-Service`).

## Local metadata cache — read-through decision (cache vs MCP)

A `PostToolUse` hook auto-writes every `get_source` / `api_release_state` /
`list_package` / `cds_dependencies` / `get_class_include` result to
`.claude/.cache/metadata/<system>/<KEY>.json` (`KEY` = `<OBJECT_TYPE>_<NAME>` for
get_source/api_release_state). Daemon-independent. **Before a read call, decide —
don't blindly trust a cache file and don't blindly re-query.** Tiered freshness,
not one flat TTL:

| Object | Trust cache? | Rule |
|---|---|---|
| In **this case's Object Impact List** (you create/edit it now) | ❌ never | Always live. The cache is stale the moment you `update_source`/`activate` it. |
| SAP **standard** (`I_`/`C_`/`P_`, non-`Z`) source or release-state | ✅ long | Stable. Cache fresh if `ts` < **30 days**, else re-query. |
| **Custom `Z`** object from **another** package (reference only) | ✅ short | Cache fresh if `ts` < **7 days**, else re-query. |
| A field you're about to **pin into Field Mapping / a design decision** | ❌ if any doubt | Re-query to confirm exact name/type/release — correctness over cost. |

Reading a cache file: parse `ts`; if older than the tier limit → treat as **miss**
and call the MCP tool (the hook overwrites the file, so the cache self-heals — no
manual cleanup). The cache stores **raw response text**, so you still read fields
out of it yourself; the win is skipping the MCP round-trip + cross-case reuse, not
pre-parsed fields. Never base a design on a cache entry you couldn't freshness-check.

## Object type codes
`CLAS` class · `INTF` interface · `PROG` program · `INCL` include · `FUGR`
function group (needs `function_group`) · `DDLS` CDS/DDL source · `DDLX`
metadata extension · `BDEF` RAP behavior definition · `SRVD` service definition
· `SRVB` service binding · `TABL` table · `VIEW`/`STRU` view/structure.

## Tool catalog

**Read / navigate**
| tool | use |
|---|---|
| `get_source(object_type,name[,function_group])` | full source of one object |
| `get_source_by_uri(uri)` | source from a uri returned by list/search |
| `get_class_method_source(class_name,method)` | one METHOD…ENDMETHOD block |
| `get_class_include(class_name,include)` | class include: definitions \| implementations \| macros \| testclasses |
| `get_object_structure(class_name)` | method-name outline of a class |
| `list_package(package[,recursive])` | objects + subpackages in a package |
| `search_objects(query[,max_results])` | name/wildcard search e.g. `ZCL_ORDER*` |
| `get_package_source(package[,max_objects])` | concatenated source of a package |
| `grep_package(package,pattern[,ignore_case,max_objects])` | regex over a package's source |

**Understand / intelligence**
| tool | use |
|---|---|
| `get_context(object_type,name[,depth])` | **one-call big picture**: DDLS→CDS deps; BDEF→behavior-for CDS + impl class; CLAS→superclass + interfaces (custom expanded, standard listed) |
| `find_references(object_uri[,line,column])` | where-used (downstream) |
| `cds_dependencies(ddls_name)` | upstream FROM/JOIN/ASSOCIATION/COMPOSITION of a CDS |
| `api_release_state(object_type,name[,function_group])` | released for ABAP Cloud? (Clean Core contracts) |

**History**
| `get_revisions(object_type,name[,function_group,include])` · `get_revision_source(version_uri)` · `compare_source(object_type,name,version_uri[,against,function_group])` (unified diff) |

**Quality / runtime**
| tool | use |
|---|---|
| `syntax_check(object_type,name[,function_group,version,source])` | syntax/check-run; pass `source` to check unsaved code |
| `run_unit_tests(object_type,name)` | ABAP Unit (CLAS/PROG/FUGR); "No ABAP Unit tests found" = the object has no test classes |
| `data_preview(query[,max_rows])` | preview a CDS entity or run an Open SQL SELECT |
| `pretty_print(source)` | format ABAP to the system's style |

**Performance profiling** (see recipe below)
| `trace_start(process_type[,max_executions,expires_minutes,title])` · `trace_list([max_runs])` · `trace_analyze(trace_uri[,top])` |

**Runtime dumps (ST22)**
| tool | use |
|---|---|
| `list_dumps([from_date,to_date,max_dumps])` | recent short dumps, newest first; dates as `yyyyMMddHHmmss`. Each line gives the dump `uri` |
| `get_dump(dump_uri)` | full dump as readable text (error analysis + source extract + call stack) — feed it to the model to diagnose the failure |

**Write** (gated — see Write safety)
| `update_source(object_type,name,source[,transport,function_group,activate])` · `update_class_include(class_name,include,source[,transport,activate])` · `activate(object_type,name[,function_group])` · `create_object(object_type,name,package[,description,source,transport,service_definition,binding_version])` |

**Clone a whole package** (gated)
| tool | use |
|---|---|
| `clone_package(source_package,target_package[,target_system,suffix,dry_run,transport])` | copy every object of `source_package` into an **already-existing** `target_package`, appending `suffix` (default `_VN`) to every name and rewriting cross-references. `dry_run=True` (default) only prints the plan — set `dry_run=False` to write. `target_system` empty = same system |

## Gotchas (non-obvious, verified)
- **`data_preview` column names = CDS element names** (as shown in the result
  header, e.g. `SalesOrder`, `MaxScheduleLine`), **not** the underlying table
  field names with underscores. A bare entity name auto-wraps to
  `SELECT * FROM <name>`; pass a full `SELECT … WHERE …` to filter. Keep leading
  zeros as strings (`'0000000085'`).
- **`data_preview` on draft/projection consumption views can 500** — query the
  interface view instead. Auth-restricted tables return "No authorization".
- **`get_context` is the fastest way to understand a RAP BO** — call it on the
  BDEF to pull the behavior-for CDS (+ its deps) and the behavior pool class in
  one shot.
- **`trace_*` captures *all* HTTP the user does in the window** — run the
  workload in isolation so the trace is clean. `process_type=http` covers
  Fiori/OData and `data_preview`; use `dialog`/`batch` otherwise.
- **`trace_list` time columns are total / ABAP / DB ms** — a high DB share means
  DB-bound; then read the DB accesses in `trace_analyze` for redundant/expensive
  SELECTs (watch `count` and `buffered`).
- **`clone_package` needs the target package to already exist** — it creates
  objects, not packages. Creates in dependency order (DOMA→…→SRVB), **skips
  `DTEL`/`DOMA`** (shell-only) and types without create support, **drops objects
  whose renamed name would exceed 30 chars**, and **activates everything at the
  end** (`activate_many`). Cross-references between cloned objects are rewritten
  to the new (suffixed) names. Always `dry_run=True` first to read the plan; the
  write gate (`allow_write` + `write_packages`) applies to the **target** system.
- **No delete** — the MCP intentionally cannot delete objects.

## Updating source into an existing object (verified IPS 2026-07-16)

`update_source(object_type,name,source,activate)` and `update_class_include(...)`
**replace the ENTIRE source, not a diff/patch**. There is no partial/append API —
always send the full new definition. Read current with `get_source` /
`get_class_include` first, edit the whole text, then write it back.

- **Add/rename table columns**: pass the full DDL with the extra fields. Adding
  columns is a **compatible change** → activates fine even on an existing table
  (empty or with data). Keep existing fields intact; put new ones anywhere
  (appending near the end is safest for tables that already hold data). Do the
  same edit on the **draft `_D`** table (field names = CDS element names,
  lowercase no underscore) so the BO stays consistent.
- **Add CDS elements**: full view source with the new `field as Element` lines;
  propagate through every layer that must expose them (interface ZI_ → projection
  ZC_ → DDLX). Adding elements is compatible; renaming/removing is not.
- **Class code**: edit the right include via `update_class_include` (`main` /
  `definitions` / `implementations` / `testclasses`) — sending method-only text
  to `main` wipes the rest. Read the include, modify, write the whole include.
- **Batch a dependent set inactive**: `update_source(activate=False)` on each,
  then one `activate` — but writes still go **one at a time** (CSRF), and a
  mutually-dependent root↔child pair does **not** mass-activate from a single
  `activate` (see rap-generate § 3.2.1 for the 3-step break).
- **Always `syntax_check(version="inactive")` (or active after activate)** —
  `update_source`/`activate` can return `"OK"` while the active version still
  carries an error (e.g. missing `@Search.defaultSearchElement`). Trust the
  syntax_check, not the write's OK.

## Write safety
Writes need the system's `allow_write: true` **and** the target package to match
its `write_packages` (default `Z*`, `$TMP`). The gate reads the object's real
package, not your argument. Transportable packages need a `transport`.
Before activating, prefer `syntax_check(..., source=<new code>)` to catch errors.

### Writes are STRICTLY SEQUENTIAL — never batch (CSRF token)
**One write per turn. Never fire multiple `create_object`/`update_source`/
`update_class_include`/`activate` in parallel in the same response.** Each write
rotates the server's CSRF token; parallel writes invalidate each other's token →
`lock failed (HTTP 403): CSRF token validation failed`, and the session can get
stuck so even a single write after `refresh_cookies_for` keeps failing. Reads
(`get_source`, `search_objects`, `list_package`, `api_release_state`…) may run in
parallel — only writes must serialize. Verified failure: a batch of 5 parallel
`create_object` on IPS left 5 empty shells then jammed CSRF for all follow-up
writes. Do: write → wait for result → next write. If CSRF fails: `refresh_cookies_for`
once → retry the **single** write; still failing → STOP, ask user to reconnect the
MCP (fresh session re-issues a clean CSRF token), don't loop.

## Recipes

**Understand an object**: `get_context(...)` first; drill in with
`get_source` / `get_class_method_source`; map impact with `find_references`.

**Edit + activate safely** (RAP logic lives in the behavior pool class
implementations include):
1. `get_source` / `get_class_include` to read current code.
2. `syntax_check(object_type,name,source=<new>)`.
3. `update_source(...)` or `update_class_include(class_name,"implementations",source)`
   (`activate=True` activates; use `False` to batch then `activate(...)`).

**Scaffold a RAP stack**: `create_object` for `TABL` → `DDLS` (interface +
projection) → `DDLX` → `BDEF` → behavior pool `CLAS` → `SRVD` → `SRVB`
(`SRVB` needs `service_definition`), passing `source` where applicable.

**Verify behavior**: `run_unit_tests(CLAS, <test class>)`; inspect data with
`data_preview`.

**Clone a package** (e.g. fork a RAP app under a new namespace):
1. Create the empty `target_package` first (the tool won't create it).
2. `clone_package(source_package, target_package, suffix="_VN", dry_run=True)`
   → review the plan (what clones, what's skipped, any >30-char errors).
3. Re-run with `dry_run=False` (and a `transport` if the target is
   transportable) → it creates, rewrites references, and activates all at once.

**Find why something is slow**:
1. `trace_start(process_type="http")`.
2. Run the slow workload (Fiori/OData action, or trigger via `data_preview`).
3. `trace_list` → pick the run's `uri` (check the DB-ms share).
4. `trace_analyze(uri)` → top time consumers + DB access table.

**Diagnose a runtime error (dump)**:
1. `list_dumps()` (optionally `from_date`/`to_date` as `yyyyMMddHHmmss`) → find
   the failing run, copy its `uri`.
2. `get_dump(uri)` → read the error category, source extract and call stack.
3. Drill into the offending code with `get_source` /
   `get_class_method_source`; map impact with `find_references`.

## Common mistakes
- Forgetting `system` / using a name not in `list_systems`.
- Filtering `data_preview` with table field names (underscores) → "Unknown
  column name". Use the CDS element names.
- Expecting `run_unit_tests` to find tests that don't exist (empty result is
  correct, not an error).
- Writing to a package outside `write_packages`, or on a system without
  `allow_write` → blocked by the safety gate (expected).
- Re-running the server and not seeing new tools in the client → reconnect the
  MCP (tool list is cached at connect time).
