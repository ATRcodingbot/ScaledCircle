"""Bounded production evidence read. No writes; output aggregate counts only.

Uses existing gcloud login. Access token and contact identifiers stay in memory.
No Stripe calls, Auth mutations, email jobs, or analytics events.
"""
import collections, datetime, json, pathlib, subprocess, urllib.request, urllib.error

ROOT = 'https://firestore.googleapis.com/v1/projects/scaled-circle/databases/(default)/documents'
GCLOUD = r'C:\Users\Greg\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
TOKEN = subprocess.run([GCLOUD, 'auth', 'print-access-token'], capture_output=True, text=True, check=True).stdout.strip()
LIMIT = 201
counts = {}

def decode(v):
    for k in ['stringValue','booleanValue','timestampValue','nullValue']:
        if k in v: return v[k]
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return v['doubleValue']
    if 'arrayValue' in v: return [decode(x) for x in v['arrayValue'].get('values',[])]
    if 'mapValue' in v: return {k:decode(x) for k,x in v['mapValue'].get('fields',{}).items()}
    return None

def read(collection, fields, filters=None, parent=''):
    query = {'from':[{'collectionId':collection}], 'limit':LIMIT,
             'select':{'fields':[{'fieldPath':x} for x in fields]}}
    if filters: query['where'] = {'fieldFilter':{'field':{'fieldPath':filters[0]},'op':'EQUAL','value':{'stringValue':filters[1]}}}
    body = json.dumps({'structuredQuery':query}).encode()
    request=urllib.request.Request(ROOT+('/'+parent if parent else '')+':runQuery', data=body,
       headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=35) as response: data=json.load(response)
    except urllib.error.HTTPError as e:
        raise RuntimeError('Read failed: '+collection+' HTTP '+str(e.code)) from None
    rows=[{'_id':r['document']['name'].split('/')[-1],**{k:decode(v) for k,v in r['document'].get('fields',{}).items()}} for r in data if 'document' in r]
    if len(rows)>=LIMIT: raise RuntimeError('Bounded inventory exceeded: '+collection)
    counts[collection]=counts.get(collection,0)+len(rows)
    return rows

def buckets(rows,key): return dict(collections.Counter(str(r.get(key,'not_recorded')) for r in rows))

users=read('users',['role','email','createdAt','earlyAccessSource','accessSource','signupPurpose','active','betaAccess'],('role','business'))
subscriptions=read('businessSubscriptions',['source','comped','status','planId','plan','internalBeta','purpose','reviewerAccess','expiresAt'])
sub_by={s['_id']:s for s in subscriptions}
setup=read('businessOnboarding',['completedAt'])
setup_by={s['_id']:s for s in setup}
profiles=read('businessGrowthProfiles',['businessName','businessDescription','servicesOffered','serviceAreas'])
profile_by={s['_id']:s for s in profiles}
# Reuse the maintained completion authority. Private profile content is passed
# in memory over stdin; only a countable boolean leaves the local child process.
completion_input=[{'id':u['_id'],'profile':profile_by.get(u['_id'],{}),'setup':setup_by.get(u['_id'],{})} for u in users]
completion_code="const {completionStatus}=require('./functions/business_onboarding');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(s).map(x=>[x.id,completionStatus(x.profile,x.setup).complete]))));"
completed=dict(json.loads(subprocess.run(['node','-e',completion_code],input=json.dumps(completion_input),capture_output=True,text=True,check=True).stdout))
receipts=read('subscriptionPaymentReceipts',['businessId','createdAt','amountCents','stripeMode','positiveAmountCollected','internalCertification'])
wallets=read('wallets',['pendingSubscriptionRequestId','pendingSubscriptionExpiresMs','pendingSubscriptionPlan'])
campaigns=read('campaigns',['businessId','executionMode','status','createdAt'])
known_founder={'attractiveremodel@gmail.com','support@scaledcircle.com'}
known_controlled={'attractiveremodel+appreview@gmail.com','mikeshandyman111@gmail.com'}
cohorts=collections.defaultdict(list)
for u in users:
    email=u.get('email','').lower()
    group='founder_operated' if email in known_founder else 'confirmed_controlled_or_reviewer' if email in known_controlled else 'unclassified_not_assumed_customer'
    cohorts[group].append(u)
out={'readAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'limitPerQuery':LIMIT-1,
     'privacy':'Aggregate output only; no record IDs, emails, addresses, content or tokens retained.',
     'cohorts':{},'subscriptions':{'total':len(subscriptions),'sources':buckets(subscriptions,'source'),'statuses':buckets(subscriptions,'status')},
     'subscriptionReceipts':{'total':len(receipts),'modes':buckets(receipts,'stripeMode'),
       'internalCertification':sum(r.get('internalCertification') is True for r in receipts),
       'positiveLiveNonCertification':sum(r.get('stripeMode')=='live' and r.get('positiveAmountCollected') is True and r.get('internalCertification') is not True for r in receipts)},
     'walletPendingCheckoutMarkers':sum(bool(w.get('pendingSubscriptionRequestId')) for w in wallets)}
for group, rows in cohorts.items():
    ids={u['_id'] for u in rows}
    totals=collections.Counter()
    kinds=collections.Counter()
    for uid in ids:
        for collection,fields in [('requests',['operation','createdAtMs']),('contactImports',['status','receipt','createdAtMs']),('customers',['createdAtMs']),('items',['sourceKind','createdAtMs'])]:
            rr=read(collection,fields,parent='businessOperations/'+uid)
            totals[collection]+=len(rr)
            if collection=='requests': kinds.update(r.get('operation','unknown') for r in rr)
            if collection=='items': kinds.update('item_source:'+r.get('sourceKind','manual_or_unrecorded') for r in rr)
    campaign_modes=collections.Counter(r.get('executionMode','not_recorded') for r in campaigns if r.get('businessId') in ids)
    recent=[u for u in rows if u.get('createdAt','') >= '2026-09-27T16:04:33Z']
    out['cohorts'][group]={'accounts':len(rows),'createdSinceAnalyticsDeployment':len(recent),
        'publicFinalizationSource':sum(u.get('earlyAccessSource')=='public_account_creation' for u in rows),
        'completedAtRecorded':sum(bool(setup_by.get(uid,{}).get('completedAt')) for uid in ids),
        'currentlyProfileComplete':sum(completed.get(uid,False) for uid in ids),
        'subscriptionSources':dict(collections.Counter(sub_by.get(uid,{}).get('source','no_subscription_record') for uid in ids)),
        'coreRecordTotals':dict(totals),'successfulRequestOperations':dict(kinds),'campaignModes':dict(campaign_modes)}
out['readDocumentCounts']=counts
target=pathlib.Path(__file__).resolve().parents[1]/'docs/qa-artifacts/first-use-20260930'
target.mkdir(parents=True,exist_ok=True)
(target/'retained-aggregate.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out,indent=2))
