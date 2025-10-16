/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var era5 = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY"),
    gldas = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H"),
    imerg = ee.ImageCollection("NASA/GPM_L3/IMERG_V07"),
    ThamesWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Thames_WS_Dissolved"),
    Thames = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Thames"),
    ColneWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Colne_WS_Dissolved"),
    Colne = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Colne"),
    KennetWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_KLE_WS_Dissolved"),
    Kennet = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Kennet"),
    BlackwaterWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Blackwater_WS_Dissolved"),
    Blackwater = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Blackwater"),
    Wye_Lower = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Lower_RSC_Dissolved_DB"),
    Wye_Lugg = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Lugg_RSC_Dissolved_DB"),
    Wye_Upper = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Wye_Upper_RSC_Dissolved_DB"),
    Cleddau_East = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Cleddau_East"),
    Cleddau_West = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Cleddau_West"),
    Stiffkey = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Stiffkey_Glaven"),
    Glaven = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Glaven"),
    NotranskjaWS = ee.FeatureCollection("users/SeamusWOD/Shapefiles/INCA/Dissolved/INCA_Notranskja_WS_Dissolved"),
    Notranskja = ee.FeatureCollection("projects/ee-seamus-noncomm/assets/PERSIST/Notranskja");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// v1.32
// Source: Kel Markert (GEE)
// Modified by Séamus O'D 16/10/2025

// Load in basin collection
// Can use features from GEE or imported assets
// UK
var THA = Thames; // C_ID 1
var CLN = Colne; // C_ID 2 good for short tests, takes 3 min to produce data.
var KLE = Kennet; // C_ID 3
var BWE = Blackwater; // C_ID 5
var CLW = Cleddau_East; // C_ID 6
var CLE = Cleddau_West; // C_ID 7
var WYU = Wye_Upper; // C_ID 8 (Wye)
var LGG = Wye_Lugg; // C_ID 8 (Wye)
var WYL = Wye_Lower; // C_ID 8 (Wye)
var SFG = Stiffkey;  // C_ID 9, also used for Glaven (C_ID 10)
var GLV = Glaven; //C_ID 10 (Currently under testing)
// EU
var CRK = Notranskja; //Cerknica, C_ID 11

// Shapefiles NEED to have all required columns (selectors) to function. 
// Currently it cannot convert Kelvin to Celsius as the .subtract breaks the script when 
// a shapefile doesn't have those columns

var Catchment = GLV;

// set the scale to run the reduction
// this is set at the imerg scale
var scale = 10000;

// set start and end date for time series to export
// NOTE - 'Image.reduceRegions: Image has no bands.' occurs if the end date is beyond the available data 
//        availability.
var startDate = ee.Date("2010-01-01");
// Get the date of the last image of the fastest Collection
// replace imerg with gldas to do the slowest updated Collection (to remove backfilled -9999 values)
var dateAgg_imerg = imerg.aggregate_array('system:time_start');
var lastDate_imerg = ee.Date(dateAgg_imerg.reduce(ee.Reducer.max()));
var endDate = lastDate_imerg;
// Print it to console to see what it is
print('Last available date for Precipitation:', endDate);
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
  var era5Filtered = era5.filterDate(t1, t2);
  // if there's no data for a particular date, it adds -9999 (cannot use NULL)
  var ERAtemp = ee.Image(
    ee.Algorithms.If(
      era5Filtered.size().gt(0),
      era5Filtered.select(['temperature_2m'], ['ERA5L_temp2m_C'])
        .mean()
        .subtract(273.15),
      ee.Image.constant(-9999).rename('ERA5L_temp2m_C')
    )
  );
    // NOTE - You cannot round these numbers as it can only be done client side (i.e. Not in Functions). 
    //        Could be done externally (in BigQuery/Google Cloud Data Table)

  // get GLDAS temp in C for the day (a backup to ERA5L)
  /*
  // get the ERA5 temp in C for the day
  var GLDASFiltered = GLDAS.filterDate(t1, t2);
  var GLDAStemp = ee.Image(
    ee.Algorithms.If(
      GLDASFiltered.size().gt(0),
      GLDASFiltered.select(['Tair_f_inst'],['GLDAS_airT_C'])
        .mean(),
      ee.Image.constant(-9999).rename('GLDAS_airT_C')
    )
  );
  */
  // get the ERA5 temp in C for the day
  var IMERGFiltered = imerg.filterDate(t1, t2);
  // get the accumulated precip for a day from IMERG
  var IMERGprecip = ee.Image(
    ee.Algorithms.If(
      IMERGFiltered.size().gt(0),
      IMERGFiltered.select(['precipitation'],['IMERG_precipCal_mm'])
        .sum()
        .divide(2), // IMERG is Half-Hourly, in mm PER HOUR. 30/60 = 2.
      ee.Image.constant(-9999).rename('IMERG_precipCal_mm')
    )
  );
  /*/
  var IMERGprecip = imerg
    .filterDate(t1,t2)
    .select(['precipitation'],['IMERG_precipCal_mm'])
    .sum();
  */
  
  // combine the meteorological  data into one image
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
    //       it creates a 'mean' band instead that has NULL value
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
// need to filter the FC list so that null bands are removed.
timeSeries.filter(ee.Filter.listContains("properties", "IMERG_precipCal_mm"));
var Imagesize2 = timeSeries.size();
print ('No. of Elements after Filtering',Imagesize2);
print('List of result with columns',timeSeries);

// convert the output to a feature collection and flatten
// FeatureCollection exports need a geometry so get the 
// centroid of the geometries to reduce geometry complexity
timeSeries = ee.FeatureCollection(timeSeries).flatten().map(function(feature){
  return feature.centroid().copyProperties(feature);
});

/*
// get the catchment name for the export details
// NOTE - This works, but not when entered into the description for Export
var Catch = Catchment.first();
var Catch2 = ee.String(Catch.get("Catchment"));
print(Catch2)
*/

// run the export to GDrive for all catchments!
Export.table.toDrive({
  collection: timeSeries,
  selectors: ['GR_ID','C_ID','Catchment','Date_8601', 'IMERG_precipCal_mm','ERA5L_temp2m_C'/*, 'GLDAS_airT_C'*/],
  description: "CatchMet_PERSIST",
  fileNamePrefix: "IDENT_Catchment_",
  fileFormat: 'CSV' //can be changed to ‘GeoJSON’
});

// BiqQuery example, for exporting into Google Cloud.
// can also export to CloudStorage, etc.
// This is the 'Dormant/Batch-Export' side of GEE
// Batch Export Tasks can run up to 7 days, and are limited only by storage capacity or the BigQuery costs
/*
Export.table.toBigQuery({
  collection: timeSeries, 
  description: "timeseries_export", 
  table: 'my-project.ee_bq_demo.watershed_timeseries'
});
*/

// This is the 'Active/On-Demand' side of GEE.
// review the latest 100 days of data
print('timeSeries (for Review)',timeSeries.limit(100,'Date_8601',false));
// This is just to show that it will timeout after 5 minutes/5000 elements
//print('Timeseries Fails', timeSeries);


// Catchment Visualisation
// Not required when fully automated, this is to confirm a Catchment shapefile has loaded in correctly
Map.centerObject(Catchment, 8);
Map.addLayer(Catchment.draw({color: 'blue', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Selected Catchment');
Map.addLayer(Thames.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Thames',false);
Map.addLayer(Colne.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Colne',false);
Map.addLayer(Kennet.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Kennet',false);
Map.addLayer(Blackwater.draw({color: '006600', strokeWidth: 2}), {"opacity":0.55,"gamma":0.1}, 'Blackwater',false);