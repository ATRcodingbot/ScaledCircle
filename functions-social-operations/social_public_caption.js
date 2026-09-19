'use strict';
// Internal provenance stays in the audit record. Block accidental publication
// rather than silently editing an immutable or owner-reviewed caption.
const internalCopy=/\b(?:INITIAL_EXPERIMENT|approval_required|bounded_managed|confidence score|generation provenance|automated workflow|AI[- ]generated|generated service concept|internal experiment|content experiment|approval state|test(?:ing)? post|experiment(?:al)? content|automatically (?:generated|scheduled|published)|AI[- ]generation|workflow state)\b/i;
module.exports={internalCopy};
