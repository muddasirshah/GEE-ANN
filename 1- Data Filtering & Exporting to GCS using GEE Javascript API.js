// Webinar Part 1 - Data Filtering and Exporting for TF
var ROI = ee.FeatureCollection('projects/ee-muddasir-shah/assets/islamabad');
var sentinel2_l2A = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED");
var filtering_images = sentinel2_l2A.filterBounds(ROI)
                      .filterDate('2023-05-01','2023-05-31')
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',5));
                      print(filtering_images,'Filtered Collection');


// Our Study Area is Covered in 2 Tiles of Same Date
// Lets Mosic them first and then Clip the mosaiced Image
// I am interested in tile 4 and 5 dated 2023-05-20
var images_ids_list = filtering_images.toList(filtering_images.size());
var tile_4 = ee.Image(images_ids_list.get(4));
var tile_5 = ee.Image(images_ids_list.get(5));
// to make a mosaic we need to make an image collection again out of these tiles
var collection = ee.ImageCollection([tile_4,tile_5]);
var mosaic = collection.mosaic();
var clipped = mosaic.clip(ROI);
print(clipped,'Clipped Image');
// Lets Visualize the Image
Map.addLayer(clipped,{min:250, max: 2500, bands:['B4','B3','B2']}, 'Sentinel-2 Image Clipped',false);



// The image reflectance values are in int() format, we need to convert that to float()
// Normalizing the image; dividing it by 10,000 as TensorFlow requires input data in floating points (all input variables must have same shape)...
// ...point format. https://www.bmc.com/blogs/data-normalization/
/// For this webinar since I will be using the 3 RGB bands and NDVI.
// This process is called standardizing and normalization of the image
// NDVI is already normalized difference and to normalize the 3 RGB bands that I will use for classification...
// ...I will divide it by the scaling factor provided by ESA. The scaling factor is 10,000 for L2A product for these bands
// Make sure to normalize each band according to its scale factor. There are other normalization techniques as well if scaling factors are not known
// calculating NDVI (Normalized Difference Vegetation Index)
var ndvi = clipped.normalizedDifference(['B8','B4']).rename('NDVI');
var normalized_RGB_bands = clipped.select(['B4','B3','B2']).divide(10000);


// Creating final image with 4 total bands (R,G,B and NDVI) that are standardized and normalized
var image = normalized_RGB_bands.addBands([ndvi]);
// Lets print and visualize the normalized Image. as you can see it has total 4 bands
print(image,'Normalized Image for Classification - bands check');
Map.addLayer(image,{min:0.025, max:0.25,bands:['B4','B3','B2']},'Final Image for Classification');


// Displaying ROI
Map.centerObject(ROI);
Map.addLayer(ROI,{color:'red'},'ROI - Islamabad',false);


// Making some training samples by using drawing some training points on (geometry type is going to be feature collection)
// I will be doing for 4 Land Cover Classes (Vegetation = 0 (green), Water = 1(blue) , Land = 2(yellow) , Urban = 3(purple)
// For now I will be generating 12 points per class 
// NDVI Vis = blue, cyan, yellow, orange, green
// you can also import your GPS based sampled data

// Labelling each class with their corresponding IDs for each point (LC for Land Cover, set any label key you want but they shoudl start from 0)
var labelled_vegetation = vegetation.map(function(feature){return feature.set({'LC':0})});
var labelled_water = water.map(function(feature){return feature.set({'LC':1})});
var labelled_land = land.map(function(feature){return feature.set({'LC':2})});
var labelled_urban = urban.map(function(feature){return feature.set({'LC':3})});
// Merging these data points and calling them GCPs

var GCPs =  labelled_vegetation.merge(labelled_water).merge(labelled_land).merge(labelled_urban);
// Lets print the GCPs
print(GCPs,'GCPs Merged');


// Now we will sample the spectral values of each band for these points (GCPs);
var sampled_GCPs = image.sampleRegions({
  collection:GCPs,
  properties:['LC'],
  scale:10
});
print(sampled_GCPs,'Bands Pixel Values Sampled Across the GCPs');


// Splitting the training and testing data (80% for training, 20% for testing)
var sampled_GCPs = sampled_GCPs.randomColumn();
var trainingGCP = sampled_GCPs.filter(ee.Filter.lt('random', 0.8));
var validationGCP = sampled_GCPs.filter(ee.Filter.gte('random', 0.8));
print(trainingGCP,'Training Data');
print(validationGCP,'Testing Data')



// Exporting the data to GCS (Google Cloud Storage) - But first setting it up
// Export Training Samples
Export.table.toCloudStorage({
  collection: trainingGCP,
  description: 'Islamabad_Training_Export',
  bucket: 'your_gcs_bucket',
  fileNamePrefix: 'isb_training_points',
  fileFormat: 'TFRecord'
})

// Export Validation Samples
Export.table.toCloudStorage({
  collection: validationGCP,
  description: 'Islamabad_Testing_Export',
  bucket: 'your_gcs_bucket',
  fileNamePrefix: 'isb_testing_points',
  fileFormat: 'TFRecord'
});


// Exporting the image in small patches
// Export Image Patches
var imageExportOptions = {
  'patchDimensions': [64, 64],
  'maxFileSize': 104857600,
  'compressed': true
}
Export.image.toCloudStorage({
  image: image,
  description: 'Islamabad_Image_Export',
  bucket: 'your_gcs_bucket',
  fileNamePrefix: 'Islamabad_Image',
  region: ROI,
  scale: 10,
  fileFormat: 'TFRecord',
  formatOptions: imageExportOptions
})


