async function req(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r;
}

export const getState = async () => (await req("/api/state")).json();

export const ingest = async (text, name, mode) =>
  (await req("/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, name, mode }),
  })).json();

export const getExport = async () => (await req("/api/export")).text();

export const getHealth = async () => (await req("/api/health")).json();
export const getSamples = async () => (await req("/api/samples")).json();
export const ingestSample = async (name, mode = "auto") =>
  (await req("/api/ingest-sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mode }),
  })).json();
