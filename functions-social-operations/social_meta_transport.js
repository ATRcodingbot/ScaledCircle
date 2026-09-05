"use strict";

const crypto = require("node:crypto");
const {prepare} = require("./social_meta_candidate");
const numeric = value => typeof value === "string" && /^\d+(?:_\d+)?$/.test(value);
// Constructed only by a transaction-authorized publisher. No retrying POSTs.
function createAdapter({job, revision, account, approval, credentials, authorizeCreate,
  fetchImpl = globalThis.fetch, now = Date.now}) {
  const plan = prepare({job, revision, account, approval});
  if (typeof authorizeCreate !== "function") throw Error("meta_send_authority_required");
  const variant = job.binding.variants.find(item => item.provider === job.provider);
  const ig = job.provider === "instagram";
  async function request(path, {method = "GET", body, params = {}} = {}) {
    if (!/^\/\d+(?:_\d+)?(?:\/(?:feed|photos|media|media_publish|published_posts))?$/.test(path)) throw Error("meta_transport_path_denied");
    if (!["GET", "POST"].includes(method)) throw Error("meta_transport_method_denied");
    const session = await credentials();
    if (session.providerUserId !== account.providerUserId || session.businessUid !== job.businessUid ||
        !session.accessToken || (ig && session.linkedPageId !== account.linkedPageId)) throw Error("meta_transport_identity_mismatch");
    const url = new URL(`https://graph.facebook.com/v26.0${path}`);
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
    if (method === "POST") await authorizeCreate();
    const response = await fetchImpl(url, {method, redirect:"error", signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${session.accessToken}`,"Content-Type":"application/json"},
      ...(body ? {body:JSON.stringify(body)} : {})});
    if (!response.ok) throw Error("meta_provider_response_unavailable");
    const result = await response.json();
    if (result.error) throw Error("meta_provider_response_unavailable");
    return result;
  }
  function validRequest(kind, req) {
    if (req?.method !== "POST") throw Error("meta_request_invalid");
    const expected = kind === "text" || kind === "photo" ? plan.request : kind === "child" ?
      (plan.container || plan.children.find(child => child.body.image_url === req.body?.image_url)) : null;
    if (expected) {
      if (req.path !== expected.path || JSON.stringify(req.body) !== JSON.stringify(expected.body)) throw Error("meta_request_changed");
    } else if (kind === "parent") {
      if (!plan.parent || req.path !== plan.parent.path || req.body?.caption !== variant.copy ||
          req.body?.media_type !== "CAROUSEL" || req.body.children?.length !== plan.children.length ||
          !req.body.children.every(numeric) || new Set(req.body.children).size !== req.body.children.length ||
          Object.keys(req.body).sort().join() !== "caption,children,media_type") throw Error("meta_parent_invalid");
    } else if (kind === "publish") {
      if (!plan.publish || req.path !== plan.publish.path || !numeric(req.body?.creation_id) ||
          Object.keys(req.body).join() !== "creation_id") throw Error("meta_publish_invalid");
    } else throw Error("meta_request_invalid");
  }
  async function verify({kind, request: req, receipt}) {
    validRequest(kind, req);
    if (!numeric(receipt?.id)) throw Error("meta_receipt_invalid");
    if (["child","parent"].includes(kind)) {
      const container=await request(`/${receipt.id}`,{params:{fields:"id,status_code"}});
      if (container.id !== receipt.id || container.status_code !== "FINISHED") throw Error("meta_container_not_ready_or_expired");
      return;
    }
    if (ig) {
      const media=await request(`/${account.providerUserId}/media`,{params:{fields:"id,caption,permalink,timestamp,media_type",limit:100}});
      const row=media.data?.find(item=>item.id===receipt.id);
      if (!row || row.caption !== variant.copy) throw Error("meta_published_identity_mismatch");
    } else {
      const post=await request(`/${receipt.id}`,{params:{fields:"id,from,message,created_time"}});
      if (post.id !== receipt.id || post.from?.id !== account.providerUserId || post.message !== variant.copy) throw Error("meta_published_identity_mismatch");
    }
  }
  return {
    async verifyAssets() {
      for (const image of revision?.images || []) {
        const response = await fetchImpl(image.url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(20000)});
        if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== image.mime ||
            Number(response.headers.get("content-length") || 0) > 8*1024*1024) throw Error("meta_media_unavailable");
        const bytes=Buffer.from(await response.arrayBuffer());
        if (bytes.length!==image.bytes || crypto.createHash("sha256").update(bytes).digest("hex")!==image.sha256) throw Error("meta_media_changed");
      }
    },
    async create({kind,request:req}) {
      validRequest(kind,req);
      const body=await request(req.path,{method:"POST",body:req.body});
      const id=kind==="photo" ? body.post_id : body.id;
      if (!numeric(id)) throw Error("meta_provider_id_missing");
      return {id,status:["child","parent"].includes(kind)?"RECEIVED":"PUBLISHED"};
    },
    verify,
    async reconcile({kind,request:req,record}) {
      validRequest(kind,req);
      if (record.observedProviderId) return {id:record.observedProviderId,
        status:["child","parent"].includes(kind)?"RECEIVED":"PUBLISHED"};
      // Meta offers no client-assigned container ID. An unknown container create
      // cannot be searched reliably and must never be blindly repeated.
      if (["child","parent"].includes(kind) || kind==="photo") return null;
      const start=record.startedAt;
      if (!Number.isFinite(start)) throw Error("meta_send_time_missing");
      const rows=await request(`/${account.providerUserId}/${ig?"media":"published_posts"}`,{
        params:{fields:ig?"id,caption,timestamp":"id,message,created_time,from",limit:100}});
      if (!Array.isArray(rows.data) || rows.paging?.next) return null;
      const matches=rows.data.filter(row => (ig ? row.caption : row.message)===variant.copy &&
        (ig || row.from?.id===account.providerUserId) &&
        Date.parse(row.timestamp || row.created_time)>=start-1000 &&
        Date.parse(row.timestamp || row.created_time)<=Math.min(now(),start+120000));
      // Matching copy/time is diagnostic evidence, not proof that this request
      // created that post. A human or another client could publish identical copy.
      // Preserve the unknown step; never fabricate a receipt or repeat a POST.
      return null;
    },
  };
}
module.exports={createAdapter};
