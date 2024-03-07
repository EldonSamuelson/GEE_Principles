/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY"),
    imerg = ee.ImageCollection("NASA/GPM_L3/IMERG_V06"),
    ThamesWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Thames_WS_Dissolved"),
    ColneWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Colne_WS_Dissolved"),
    KennetWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_KLE_WS_Dissolved");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// v1.1
// Source: Kel Markert (GEE)
// Modified by Séamus O'D 07/03/2024

// load in basin collection
// can use features from GEE or imported assests
var Thames = ThamesWS;
var Colne = ColneWS;
var Kennet = KennetWS;

// set the scale to run the reduction
// this is set at the imerg scale
var scale = 10000;

// set start and end date for time series to export
var startDate = ee.Date("2015-01-01");
var endDate = ee.Date("2023-08-01");
// calculate how many time steps to iterate over
var dateDiff = endDate.difference(startDate, "day");

// function to add date information to the reduction results
// only for use with FeatureCollection result from `reduceRegions`
// update with any additional properties needed in final table
function addDateToFeatures(features, date){
  return features.map(function(feature) {
    return feature.set('Date_8601',date.format('YYYY-MM-dd'));
  });
}

// function to calculate basin average meteorological values
// this will take an integer and 
// used to map over all dates available
function dateMetReduction(i){
  // calculate date by offset from start date
  var t1 = startDate.advance(i, "day");
  var t2 = t1.advance(1, "day");
  
  // get the ERA5 temp in C for the day
  var temp = era5
    .filterDate(t1,t2)
    .select('temperature_2m')
    .mean()
    .subtract(273.15);
    
  // get the accumulated precip for a day from IMERG
  var precip = imerg
    .filterDate(t1,t2)
    .select('precipitationCal')
    .sum();
  
  // combine the meterological data into one image
  // add additional met/image variables as needed
  var forcingImg = ee.Image.cat([
    temp,
    precip
  ]);
  
  // // calculate the basin average for a single feature
  // // only use for a single basin
  // var result = forcingImg.reduceRegion({
  //   geometry: singleCatchment.geometry(),
  //   reducer: ee.Reducer.mean(),
  //   scale: scale
  // })
  
 // Calculate the basin average per feature
 // use for a collection of catchments
 // this will output a collection where the met data will be properties
  var result = forcingImg.reduceRegions({
    collection: Thames,
    reducer: ee.Reducer.mean(),
    scale: scale
  });
  // NOTE: this will not perform well if grouping catchments that are very far each other. eg Thames and Mekong
  //       but this works great for multiple basins that are grouped
  
  // if the output is a collection then add the date information to it
  result = addDateToFeatures(result, t1);
  
  return result;
}

// apply the function to calculate basin averages for each date from start to end
var timeSeries = ee.List.sequence(0, dateDiff).map(dateMetReduction);

// convert the output to a feature collection and flatten
// FeatureCollection exports need a geometry so get the 
// centroid of the geometries to reduce geometry complexity
timeSeries = ee.FeatureCollection(timeSeries).flatten().map(function(feature){
  return feature.centroid().copyProperties(feature);
});


// run the export to GDrive for all catchments!
Export.table.toDrive({
  collection: timeSeries,
  selectors: ['GR_ID','C_ID','date', 'precipitationCal','temperature_2m'],
  description: "TS_exportToDrive",
  fileFormat: 'CSV'
});

// BiqQuery example, for exporting into Google Cloud.
// can also export to Drive, CloudStorage, etc.
// This is the 'Dormant/Batch-Export' side of GEE
// Batch Export Tasks can run up to 7 days, and are limited only by storage capacity or the BigQuery costs
/*
Export.table.toBigQuery({
  collection: timeSeries, 
  description: "thames_timeseries_export", 
  table: 'my-project.ee_bq_demo.watershed_timeseries'
});
*/
// This is just to show that it will timeout after 5 minutes/5000 elements
// This is the 'Active/On-Demand' side of GEE.
//print(timeSeries);