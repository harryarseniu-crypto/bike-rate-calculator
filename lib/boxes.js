// BikeFlights boxes — assembled (shipping) dimensions in inches and a typical
// packed weight (lb) used as the default when the visitor doesn't give one.
// Dimensions pulled from shop.bikeflights.com product pages.
export const BOXES = {
  bbs:  { name: "Bike Box Small (BBS)",        length: 43, width: 10, height: 24, defaultWeight: 25,
          fits: "Kids' and BMX bikes, framesets" },
  bbm:  { name: "Bike Box Medium (BBM)",       length: 45, width: 12, height: 30, defaultWeight: 35,
          fits: "Most road, gravel and smaller mountain bikes" },
  bbl:  { name: "Bike Box Large (BBL)",        length: 64, width: 14, height: 32, defaultWeight: 45,
          fits: "Road, gravel, mountain and e-bikes (rear wheel on)" },
  bbxl: { name: "Bike Box Extra Large (BBXL)", length: 56, width: 21, height: 32, defaultWeight: 42,
          fits: "Aero road, triathlon and fat bikes" },
};

// Contents options mirror the BikeFlights /ship "Contents" dropdown.
export const CONTENTS = [
  "Complete Bicycle",
  "Complete E-Bike With Battery Installed",
  "Bicycle Frame",
  "Bicycle Wheel(s)",
  "Bicycle Parts (No Batteries)",
];

export function boxFor(size) {
  return BOXES[size] || BOXES.bbm;
}
