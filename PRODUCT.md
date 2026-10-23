# Math Digital Garden

Persian mathematics reading and personal note workspace built with Astro/Starlight and FastAPI. Public notes are discoverable at /search and read at /notes/[slug]. /sample renders a bundled, explicitly identified reading fixture without a database. Local Vazirmatn, KaTeX, callouts and wikilinks support mathematical prose.

Authenticated users keep personal Markdown forks, bookmarks, history and change proposals in /workspace. /account implements login/registration with real API calls. Authors/admins compare and decide proposals in /review. CodeMirror and MathLive preserve the raw Markdown editing contract; server authorization owns private data access.

The assistant is optional on real note pages, receives selected saved content and a revision hash, and streams through the existing site API. Dify is the approved engine. A visible UI or fake test does not prove a configured real provider, trustworthy citations or successful model execution.

Read mode: home, search, reader and sample. Operate mode: account, workspace and review. Product truth comes from existing code/API and docs/00-PRD.md; no generated testimonials, fake progress or fabricated notes. Frontend scope excludes destructive data changes and secret/provider configuration.
