// Backfill sortKey / sortOrdinal / sortVariant on Jobs:Items.
//
// Required after deploying the PricedMaterialItem sort-key change so existing
// documents become sortable via the new collated compound index. Idempotent —
// skips documents that already have sortKey set.
//
// Covers documents read by both GetForTeamAsync and GetPaginatedTeamIteamsAsync
// (same collection).
//
// Regex logic mirrors PricedMaterialItem.SetSortKeys in C#:
//   ordinal prefix: ^(\d+)(?:st|nd|rd|th)\s+(.+)$  (case-insensitive)
//   bracket suffix: \s*\([^)]*\)\s*$
//
// Uses an aggregation pipeline with $merge to compute and write sort fields
// server-side — no client-side cursor iteration required. Idempotent.
//
// Run with: mongosh "<connection-string>" --file 2026-05-19_backfill_item_sort_keys.js
//----------------------------------------------------------------------------------------------------------
const COLLECTION = "Jobs:Items";
//update isArchived to false if it is null, to ensure that the backfill process includes all relevant documents. This is necessary because the backfill logic only processes documents where sortKey does not exist, and we want to make sure that all documents are included in the backfill, even those that may have been archived without an explicit isArchived value set.
const items = db.getCollection(COLLECTION);

const result = items.updateMany({
    isArchived: null

}, {
    $set: {
        isArchived: false,
    }
});
//------------------------------------------------------------------------------------------------------------------
print(`matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
const totalToProcess = items.countDocuments({sortKey: {$exists: false}});
print(`[backfill] documents missing sortKey: ${totalToProcess}`);

if (totalToProcess === 0) {
    print("[backfill] nothing to do.");
} else {
    print("[backfill] running aggregation pipeline...");

    items.aggregate(
        [
            // ── 1. Only process documents that have not been backfilled yet ──────
            {$match: {sortKey: {$exists: false}}},

            // ── 2. Resolve the raw source name ───────────────────────────────────
            {
                $addFields: {
                    _source: {$ifNull: ["$name", ""]}
                }
            },

            // ── 3. Try to match the ordinal prefix  ^(\d+)(st|nd|rd|th)\s+(.+)$ ─
            {
                $addFields: {
                    _ordinalMatch: {
                        $regexFind: {
                            input: "$_source",
                            regex: /^(\d+)(?:st|nd|rd|th)\s+(.+)$/i
                        }
                    }
                }
            },

            // ── 4. Derive sortOrdinal and nameWithoutOrdinal ──────────────────────
            {
                $addFields: {
                    sortOrdinal: {
                        $cond: {
                            if: {$ne: ["$_ordinalMatch", null]},
                            then: {$toInt: {$arrayElemAt: ["$_ordinalMatch.captures", 0]}},
                            else: 0
                        }
                    },
                    _nameWithoutOrdinal: {
                        $trim: {
                            input: {
                                $cond: {
                                    if: {$ne: ["$_ordinalMatch", null]},
                                    then: {$arrayElemAt: ["$_ordinalMatch.captures", 1]},
                                    else: "$_source"
                                }
                            }
                        }
                    }
                }
            },

            // ── 5. Try to match the bracket suffix  \s*\([^)]*\)\s*$ ─────────────
            {
                $addFields: {
                    _bracketMatch: {
                        $regexFind: {
                            input: "$_nameWithoutOrdinal",
                            regex: /\s*\([^)]*\)\s*$/
                        }
                    }
                }
            },

            // ── 6. Compute sortKey and sortVariant ───────────────────────────────
            {
                $addFields: {
                    sortKey: {
                        $cond: {
                            if: {$ne: ["$_bracketMatch", null]},
                            then: {
                                $trim: {
                                    input: {
                                        $substrCP: [
                                            "$_nameWithoutOrdinal",
                                            0,
                                            "$_bracketMatch.idx"
                                        ]
                                    }
                                }
                            },
                            else: "$_nameWithoutOrdinal"
                        }
                    },
                    sortVariant: {
                        $cond: {
                            if: {$ne: ["$_bracketMatch", null]},
                            then: 1,
                            else: 0
                        }
                    }
                }
            },

            // ── 7. Drop all temporary pipeline fields ────────────────────────────
            {$unset: ["_source", "_ordinalMatch", "_nameWithoutOrdinal", "_bracketMatch"]},

            // ── 8. Merge computed fields back into the collection ─────────────────
            {
                $merge: {
                    into: COLLECTION,
                    on: "_id",
                    whenMatched: "merge",
                    whenNotMatched: "discard"
                }
            }
        ],
        {allowDiskUse: true}
    );

    const remaining = items.countDocuments({sortKey: {$exists: false}});
    const modified = totalToProcess - remaining;
    print(`[backfill] done. total modified: ${modified}`);
}
