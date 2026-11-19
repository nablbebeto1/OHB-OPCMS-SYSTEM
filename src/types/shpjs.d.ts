declare module 'shpjs' {
  function shp(
    buffer: ArrayBuffer | Buffer | Uint8Array
  ): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;
  export default shp;
}
