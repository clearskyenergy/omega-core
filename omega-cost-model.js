/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Browser presentation metadata only. Prices come from authenticated /api/price-site. */
(function(root){
  "use strict";
  var M = {
  "DEFAULT_HOURS": 4,
  "VOLT": {
    "480": {
      "label": "480 V secondary (behind the meter)"
    },
    "4160": {
      "label": "4.16 kV"
    },
    "12470": {
      "label": "12 kV primary"
    },
    "34500": {
      "label": "34.5 kV primary"
    },
    "": {
      "label": "Not answered — priced as 12 kV"
    }
  },
  "UPGRADE": {
    "none": {
      "label": "None required — study complete",
      "wk": 0,
      "exposure": false
    },
    "": {
      "label": "Unknown — study not returned",
      "wk": 0,
      "exposure": true
    },
    "xfmr": {
      "label": "Utility transformer replacement",
      "wk": 22,
      "exposure": false
    },
    "swg": {
      "label": "Transformer plus switchgear or protection",
      "wk": 30,
      "exposure": false
    },
    "line": {
      "label": "Line reconductor or substation work",
      "wk": 44,
      "exposure": false
    }
  },
  "SOIL_LBL": {
    "good": "Firm, drains, no import fill",
    "": "Not answered — priced as typical",
    "poor": "Soft, fill, or high water table",
    "rock": "Rock or deep foundations"
  },
  "AHJ_LBL": {
    "fast": "Streamlined — over-the-counter permit",
    "": "Not answered — priced as typical",
    "hard": "Difficult — hearings, long review"
  },
  "LABOR_LBL": {
    "open": "Open shop",
    "": "Not answered — priced as open shop",
    "pw": "Prevailing wage",
    "pla": "Union / project labour agreement"
  }
};
  M.vendorHasPrice = function(v){ return !!(v && typeof v.dcPerKwh === "number" && v.dcPerKwh > 0); };
  M.quoteExpired = function(v){ return !!(v && v.expires && Date.parse(v.expires) < Date.now()); };
  M.quoteStale = function(v){ return M.quoteExpired(v) || !!(v && v.date && Math.floor((Date.now() - Date.parse(v.date)) / 86400000) > 180); };
  M.atGate = function(v){ return !!(v && /^\s*(EXW|FCA|EX\s*WORKS)/i.test(v.incoterm || "")); };
  var names = ["VOLT","UPGRADE","SOIL_LBL","AHJ_LBL","LABOR_LBL"];
  for(var i=0;i<names.length;i++) root[names[i]] = M[names[i]];
  root.OmegaCostModel = M;
  if(typeof module !== "undefined" && module.exports) module.exports = M;
})(typeof window !== "undefined" ? window : this);
