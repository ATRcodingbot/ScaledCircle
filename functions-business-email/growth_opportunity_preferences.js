'use strict';
const {classification}=require('./growth_opportunities');
const DEFAULTS=Object.freeze({residential:true,commercial:true,propertyManagement:true,government:false,vendorNetworks:true,workforceCandidates:true,recruitmentPartners:true,paidLeadSources:false});
function normalize(input){
  if(input==null)return {...DEFAULTS};
  if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(DEFAULTS,k)||typeof input[k]!=='boolean')){
    const error=Error('Choose supported Growth opportunity preferences.');error.code='invalid-argument';throw error;
  }
  return {...DEFAULTS,...input};
}
function category(row){
  const type=classification(row);
  return ({public_bid:'government',residential_signal:'residential',direct_project:'commercial',commercial:'commercial',business_account:'commercial',property_facility:'propertyManagement',property_management:'propertyManagement',partner_channel:'vendorNetworks',information:'vendorNetworks',recruitment_channel:'recruitmentPartners',workforce_candidate:'workforceCandidates',paid_lead_source:'paidLeadSources'})[type];
}
function enabled(row,input){return normalize(input)[category(row)]===true;}
function project(row,input){const allowed=enabled(row,input);return {...row,growthPreferenceCategory:category(row),excludedByGrowthPreferences:!allowed,...(!allowed?{preferenceStatus:'Excluded by Growth Preferences',currentOpportunity:false,needsApproval:false}:{} )};}
function active(rows,input){return rows.filter(row=>enabled(row,input));}
module.exports={DEFAULTS,normalize,category,enabled,project,active};
