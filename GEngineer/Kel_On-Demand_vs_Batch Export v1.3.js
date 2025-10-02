/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY"),
    gldas = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H"),
    imerg = ee.ImageCollection("NASA/GPM_L3/IMERG_V07"),
    ThamesWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Thames_WS_Dissolved"),
    ColneWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Colne_WS_Dissolved"),
    KennetWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_KLE_WS_Dissolved"),
    BlackwaterWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Blackwater_WS_Dissolved"),
    Wye_Lower = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Lower_RSC_Dissolved_DB"),
    Wye_Lugg = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Lugg_RSC_Dissolved_DB"),
    Wye_Upper = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Upper_RSC_Dissolved_DB"),
    NotranskjaWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Notranskja_WS_Dissolved");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// v1.3
// Source: Kel Markert (GEE)
// Modified by Séamus O'D 02/10/2025

// load in basin collection
// can use features from GEE or imported assets
// UK
var Thames = ThamesWS;
var Colne = ColneWS;
var Kennet = KennetWS;
var Blackwater = BlackwaterWS;
var Wye_Up = Wye_Upper;
var Lugg = Wye_Lugg;
var Wye_Low = Wye_Lower;
// EU
var Notranskja = NotranskjaWS;

// Shapefiles NEED to have all required columns (selectors) to function. 
// Currently it cannot convert Kelvin to Celsius as the .subtract breaks the script when 
// a shapefile doesn't have those columns

var Catchment = Notranskja;

// set the scale to run the reduction
// this is set at the imerg scale
var scale = 10000;

// set start and end date for time series to export
// NOTE - 'Image.reduceRegions: Image has no bands.' occurs if the end date is beyond the available data 
//        availability.
var startDate = ee.Date("2010-01-01");
var endDate = ee.Date("2025-09-22");
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
  var ERAtemp = era5
    .filterDate(t1,t2)
    .select(['temperature_2m'],['ERA5L_temp2m_C'])
    .mean()
    .subtract(273.15);
    // NOTE - You cannot round these as it can only be done client side (i.e. Not in Functions). 
    //        Could be done externally (in BigQuery/Google Cloud Data Table)

  // get GLDAS temp in C for the day
  /*var GLDAStemp = gldas
    .filterDate(t1,t2)
    .select(['Tair_f_inst'],['GLDAS_airT_C'])
    .mean()
    .subtract(273.15);*/
    // NOTE - 'Image.subtract: If one image has no bands, the other must also have no bands. Got 0 and 1.'
    //        Occurs when the band has no data after a specific end date.
    
  // get the accumulated precip for a day from IMERG
  var IMERGprecip = imerg
    .filterDate(t1,t2)
    .select(['precipitation'],['IMERG_precipCal_mm'])
    .sum();
  
  // combine the meterological data into one image
  // add additional met/image variables as needed
  var forcingImg = ee.Image.cat([
    ERAtemp,
    /*GLDAStemp,*/
    IMERGprecip
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
    collection: Catchment,
    reducer: ee.Reducer.mean(),
    // NOTE: When the forcingImg has no bands (endDate>Data available date, 
    //       it creates a 'mean' band instead that has 0 value
    scale: scale
  });
  // NOTE: this will not perform well if grouping catchments that are very far from each other. eg Thames and Mekong
  //       but this works great for multiple basins that are grouped
  
  // if the output is a collection then add the date information to it
  result = addDateToFeatures(result, t1);
  
  return result;
}

// apply the function to calculate basin averages for each date from start to end
var timeSeries = ee.List.sequence(0, dateDiff).map(dateMetReduction);

var Imagesize = timeSeries.size();

print ('No. of Elements',Imagesize);

print('List of result with columns',timeSeries);
// need to filter the FC list so that null bands are removed.
timeSeries.filter(ee.Filter.listContains("properties", "IMERG_precipCal_mm"));
var Imagesize2 = timeSeries.size();
//makes an error so you look here
print ('No. of Elements after Filtering',Imagesize2);

// convert the output to a feature collection and flatten
// FeatureCollection exports need a geometry so get the 
// centroid of the geometries to reduce geometry complexity
timeSeries = ee.FeatureCollection(timeSeries).flatten().map(function(feature){
  return feature.centroid().copyProperties(feature);
});

// run the export to GDrive for all catchments!
Export.table.toDrive({
  collection: timeSeries,
  selectors: ['GR_ID','C_ID','Catchment','Date_8601', 'IMERG_precipCal_mm','ERA5L_temp2m_C'/*, 'GLDAS_airT_C'*/],
  description: "IDENT_Catchment",
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
print('timeSeries Limited',timeSeries.limit(4999));
print('Timeseries Fails', timeSeries);

Map.centerObject(Catchment, 8);
Map.addLayer(Catchment.draw({color: 'blue', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Selected Catchment');
Map.addLayer(Thames.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Thames',false);
Map.addLayer(Colne.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Colne',false);
Map.addLayer(Kennet.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Kennet',false);
Map.addLayer(Blackwater.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Blackwater',false);