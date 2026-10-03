/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Where parcel lines go next: the order the property-line coverage is built
 * in, state by state (Tommy, 2026-10-03: "go state by state in the rank of
 * states with good programs for battery energy storage and higher ranked on
 * energy efficiency … we need to map out the country eventually").
 *
 * The backbone is ACEEE's 2025 State Energy Efficiency Scorecard
 * (https://www.aceee.org/state-energy-efficiency-scorecard-2025/), ties
 * kept. Three battery markets that sit outside its top 25 are pulled up
 * behind it because storage is what this product sells there: Texas (ERCOT),
 * Arizona and Puerto Rico (not scored). Everything else follows in ACEEE
 * order. Re-order here, never in a script.
 *
 * `cities` are downtown points in each state's largest load centres, where
 * a customer's site is likeliest: scripts/parcel-coverage.js asks whether a
 * parcel layer draws at each. A state is mapped when every one draws. Two
 * to four a state is a sample, not a survey: a state can read as mapped and
 * still have an uncovered county.
 *
 * Planning data for scripts only; never shipped. */
'use strict';

var RANKED = [
  { st: 'CA', name: 'California', aceee: 1, cities: [['Los Angeles', 34.0522, -118.2437], ['San Francisco', 37.7749, -122.4194], ['San Diego', 32.7157, -117.1611], ['Fresno', 36.7378, -119.7871]] },
  { st: 'MA', name: 'Massachusetts', aceee: 2, cities: [['Boston', 42.3601, -71.0589], ['Worcester', 42.2626, -71.8023], ['Springfield', 42.1015, -72.5898]] },
  { st: 'NY', name: 'New York', aceee: 3, cities: [['Manhattan', 40.7580, -73.9855], ['Nassau County', 40.7282, -73.5940], ['Buffalo', 42.8864, -78.8784], ['Rochester', 43.1566, -77.6088]] },
  { st: 'MD', name: 'Maryland', aceee: 4, cities: [['Baltimore', 39.2904, -76.6122], ['Silver Spring', 38.9907, -77.0261]] },
  { st: 'VT', name: 'Vermont', aceee: 4, cities: [['Burlington', 44.4759, -73.2121], ['Rutland', 43.6106, -72.9726]] },
  { st: 'WA', name: 'Washington', aceee: 6, cities: [['Seattle', 47.6062, -122.3321], ['Spokane', 47.6588, -117.4260], ['Tacoma', 47.2529, -122.4443]] },
  { st: 'CO', name: 'Colorado', aceee: 7, cities: [['Denver', 39.7392, -104.9903], ['Colorado Springs', 38.8339, -104.8214], ['Fort Collins', 40.5853, -105.0844], ['Pueblo', 38.2544, -104.6091]] },
  { st: 'NJ', name: 'New Jersey', aceee: 8, cities: [['Newark', 40.7357, -74.1724], ['Trenton', 40.2206, -74.7597], ['Camden', 39.9259, -75.1196]] },
  { st: 'OR', name: 'Oregon', aceee: 9, cities: [['Portland', 45.5152, -122.6784], ['Salem', 44.9429, -123.0351], ['Eugene', 44.0521, -123.0868]] },
  { st: 'MN', name: 'Minnesota', aceee: 10, cities: [['Minneapolis', 44.9778, -93.2650], ['St Paul', 44.9537, -93.0900], ['Rochester', 44.0121, -92.4802], ['Duluth', 46.7867, -92.1005]] },
  { st: 'ME', name: 'Maine', aceee: 11, cities: [['Portland', 43.6591, -70.2568], ['Bangor', 44.8012, -68.7778]] },
  { st: 'DC', name: 'District of Columbia', aceee: 12, cities: [['Washington', 38.9072, -77.0369]] },
  { st: 'CT', name: 'Connecticut', aceee: 13, cities: [['Hartford', 41.7658, -72.6734], ['New Haven', 41.3083, -72.9279], ['Bridgeport', 41.1792, -73.1894]] },
  { st: 'RI', name: 'Rhode Island', aceee: 13, cities: [['Providence', 41.8240, -71.4128]] },
  { st: 'IL', name: 'Illinois', aceee: 15, cities: [['Chicago', 41.8781, -87.6298], ['Peoria', 40.6936, -89.5890], ['Champaign', 40.1164, -88.2434], ['McHenry', 42.3334, -88.2668]] },
  { st: 'HI', name: 'Hawaii', aceee: 16, cities: [['Honolulu', 21.3069, -157.8583], ['Hilo', 19.7071, -155.0885]] },
  { st: 'MI', name: 'Michigan', aceee: 17, cities: [['Detroit', 42.3314, -83.0458], ['Grand Rapids', 42.9634, -85.6681], ['Ann Arbor', 42.2808, -83.7430], ['Lansing', 42.7325, -84.5555]] },
  { st: 'NH', name: 'New Hampshire', aceee: 18, cities: [['Manchester', 42.9956, -71.4548], ['Nashua', 42.7654, -71.4676], ['Concord', 43.2081, -71.5376]] },
  { st: 'DE', name: 'Delaware', aceee: 19, cities: [['Wilmington', 39.7391, -75.5398], ['Dover', 39.1582, -75.5244]] },
  { st: 'VA', name: 'Virginia', aceee: 20, cities: [['Richmond', 37.5407, -77.4360], ['Virginia Beach', 36.8529, -75.9780], ['Arlington', 38.8816, -77.0910]] },
  { st: 'NM', name: 'New Mexico', aceee: 21, cities: [['Albuquerque', 35.0844, -106.6504], ['Santa Fe', 35.6870, -105.9378], ['Las Cruces', 32.3199, -106.7637]] },
  { st: 'PA', name: 'Pennsylvania', aceee: 22, cities: [['Philadelphia', 39.9526, -75.1652], ['Pittsburgh', 40.4406, -79.9959], ['Harrisburg', 40.2732, -76.8867]] },
  { st: 'NV', name: 'Nevada', aceee: 23, cities: [['Las Vegas', 36.1699, -115.1398], ['Reno', 39.5296, -119.8138]] },
  { st: 'UT', name: 'Utah', aceee: 23, cities: [['Salt Lake City', 40.7608, -111.8910], ['Provo', 40.2338, -111.6585], ['Ogden', 41.2230, -111.9738]] },
  { st: 'WI', name: 'Wisconsin', aceee: 25, cities: [['Milwaukee', 43.0389, -87.9065], ['Madison', 43.0731, -89.4012], ['Green Bay', 44.5133, -88.0133]] },
  /* battery markets outside ACEEE's top 25, pulled up */
  { st: 'TX', name: 'Texas', aceee: 36, storage: true, cities: [['Houston', 29.7604, -95.3698], ['Dallas', 32.7767, -96.7970], ['Austin', 30.2672, -97.7431], ['San Antonio', 29.4241, -98.4936]] },
  { st: 'AZ', name: 'Arizona', aceee: 29, storage: true, cities: [['Phoenix', 33.4484, -112.0740], ['Tucson', 32.2226, -110.9747], ['Flagstaff', 35.1983, -111.6513]] },
  { st: 'PR', name: 'Puerto Rico', aceee: null, storage: true, cities: [['San Juan', 18.4655, -66.1057], ['Ponce', 18.0111, -66.6141]] },
  /* the rest, in ACEEE order */
  { st: 'NC', name: 'North Carolina', aceee: 26, cities: [['Charlotte', 35.2271, -80.8431], ['Raleigh', 35.7796, -78.6382]] },
  { st: 'FL', name: 'Florida', aceee: 27, cities: [['Miami', 25.7617, -80.1918], ['Tampa', 27.9506, -82.4572], ['Orlando', 28.5383, -81.3792], ['Jacksonville', 30.3322, -81.6557]] },
  { st: 'TN', name: 'Tennessee', aceee: 28, cities: [['Nashville', 36.1627, -86.7816], ['Memphis', 35.1495, -90.0490], ['Knoxville', 35.9606, -83.9207], ['Chattanooga', 35.0456, -85.3097]] },
  { st: 'MT', name: 'Montana', aceee: 30, cities: [['Billings', 45.7833, -108.5007], ['Missoula', 46.8721, -113.9940]] },
  { st: 'IN', name: 'Indiana', aceee: 31, cities: [['Indianapolis', 39.7684, -86.1581], ['Fort Wayne', 41.0793, -85.1394], ['Evansville', 37.9716, -87.5711]] },
  { st: 'AR', name: 'Arkansas', aceee: 32, cities: [['Little Rock', 34.7465, -92.2896], ['Fayetteville', 36.0626, -94.1574]] },
  /* Idaho's statewide layer is not used: its licence keeps the data inside
     IDWR. County layers would bring it in. */
  { st: 'ID', name: 'Idaho', aceee: 33, cities: [['Boise', 43.6150, -116.2023], ['Idaho Falls', 43.4917, -112.0339]] },
  { st: 'GA', name: 'Georgia', aceee: 34, cities: [['Atlanta', 33.7490, -84.3880], ['Savannah', 32.0809, -81.0912]] },
  { st: 'OK', name: 'Oklahoma', aceee: 34, cities: [['Oklahoma City', 35.4676, -97.5164], ['Tulsa', 36.1540, -95.9928]] },
  { st: 'LA', name: 'Louisiana', aceee: 37, cities: [['New Orleans', 29.9511, -90.0715], ['Baton Rouge', 30.4515, -91.1871]] },
  { st: 'IA', name: 'Iowa', aceee: 38, cities: [['Des Moines', 41.5868, -93.6250], ['Cedar Rapids', 41.9779, -91.6656]] },
  { st: 'MO', name: 'Missouri', aceee: 38, cities: [['Kansas City', 39.0997, -94.5786], ['St Louis', 38.6270, -90.1994], ['Springfield', 37.2090, -93.2923]] },
  { st: 'OH', name: 'Ohio', aceee: 40, cities: [['Columbus', 39.9612, -82.9988], ['Cleveland', 41.4993, -81.6944], ['Cincinnati', 39.1031, -84.5120]] },
  { st: 'SC', name: 'South Carolina', aceee: 40, cities: [['Charleston', 32.7765, -79.9311], ['Columbia', 34.0007, -81.0348], ['Greenville', 34.8526, -82.3940]] },
  { st: 'AK', name: 'Alaska', aceee: 40, cities: [['Anchorage', 61.2181, -149.9003]] },
  { st: 'KY', name: 'Kentucky', aceee: 43, cities: [['Louisville', 38.2527, -85.7585], ['Lexington', 38.0406, -84.5037]] },
  { st: 'NE', name: 'Nebraska', aceee: 44, cities: [['Omaha', 41.2565, -95.9345], ['Lincoln', 40.8136, -96.7026]] },
  { st: 'ND', name: 'North Dakota', aceee: 45, cities: [['Fargo', 46.8772, -96.7898], ['Bismarck', 46.8083, -100.7837]] },
  { st: 'WV', name: 'West Virginia', aceee: 45, cities: [['Charleston', 38.3498, -81.6326], ['Morgantown', 39.6295, -79.9559]] },
  { st: 'SD', name: 'South Dakota', aceee: 47, cities: [['Sioux Falls', 43.5446, -96.7311], ['Rapid City', 44.0805, -103.2310]] },
  { st: 'KS', name: 'Kansas', aceee: 48, cities: [['Wichita', 37.6872, -97.3301], ['Overland Park', 38.9822, -94.6708], ['Kansas City KS', 39.1142, -94.6275]] },
  { st: 'MS', name: 'Mississippi', aceee: 49, cities: [['Jackson', 32.2988, -90.1848], ['Gulfport', 30.3674, -89.0928]] },
  { st: 'AL', name: 'Alabama', aceee: 50, cities: [['Birmingham', 33.5186, -86.8104], ['Huntsville', 34.7304, -86.5861], ['Mobile', 30.6954, -88.0399]] },
  { st: 'WY', name: 'Wyoming', aceee: 51, cities: [['Cheyenne', 41.1400, -104.8202], ['Casper', 42.8501, -106.3252]] }
];

module.exports = { RANKED: RANKED, SOURCE: 'ACEEE 2025 State Energy Efficiency Scorecard' };
