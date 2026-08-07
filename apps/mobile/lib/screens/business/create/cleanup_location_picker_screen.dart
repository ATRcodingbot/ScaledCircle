import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';


class CleanupLocationResult {
  final LatLng point;
  final String address;

  const CleanupLocationResult({
    required this.point,
    required this.address,
  });
}



class CleanupLocationPickerScreen extends StatefulWidget {
  const CleanupLocationPickerScreen({
    super.key,
  });

  @override
  State<CleanupLocationPickerScreen> createState() =>
      _CleanupLocationPickerScreenState();
}



class _CleanupLocationPickerScreenState
    extends State<CleanupLocationPickerScreen> {


  final MapController _mapController =
      MapController();


  final TextEditingController searchController =
      TextEditingController();



  static const LatLng _defaultCenter =
      LatLng(
        39.2904,
        -76.6122,
      );



  LatLng? _selectedPoint;

  String? _selectedAddress;


  bool searching = false;



  @override
  void dispose() {

    searchController.dispose();

    _mapController.dispose();

    super.dispose();
  }




  Future<void> searchAddress() async {

    final query =
        searchController.text.trim();


    if (query.isEmpty) {
      return;
    }


    setState(() {
      searching = true;
    });



    try {


      final url = Uri.parse(
        "https://nominatim.openstreetmap.org/search"
        "?q=${Uri.encodeComponent(query)}"
        "&format=json"
        "&limit=1",
      );



      final response =
          await http.get(
        url,
        headers: {
          "User-Agent":
              "ScaledCircle-Mobile",
        },
      );



      if (response.statusCode != 200) {

        throw Exception(
          "Location search failed.",
        );

      }



      final List<dynamic> results =
          jsonDecode(response.body);



      if (results.isEmpty) {

        throw Exception(
          "Address not found.",
        );

      }



      final result =
          results.first;



      final point =
          LatLng(

        double.parse(
          result["lat"].toString(),
        ),

        double.parse(
          result["lon"].toString(),
        ),

      );



      if (!mounted) {
        return;
      }



      setState(() {

        _selectedPoint =
            point;

        _selectedAddress =
            result["display_name"];

      });



      _mapController.move(
        point,
        17,
      );



    } catch (e) {


      if (!mounted) {
        return;
      }


      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content:
              Text(
            e.toString(),
          ),
        ),
      );



    } finally {


      if (mounted) {

        setState(() {

          searching = false;

        });

      }

    }

  }




  void handleMapTap(
    TapPosition tapPosition,
    LatLng point,
  ) {

    setState(() {

      _selectedPoint =
          point;


      _selectedAddress =
          "Selected map location";

    });

  }




  void confirmLocation() {


    if (_selectedPoint == null) {


      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content:
              Text(
            "Select a location first.",
          ),
        ),
      );


      return;

    }



    Navigator.pop(
      context,
      CleanupLocationResult(
        point:
            _selectedPoint!,

        address:
            _selectedAddress ??
                "Selected location",
      ),
    );

  }





  @override
  Widget build(BuildContext context) {


    return Scaffold(

      appBar:
          AppBar(
        title:
            const Text(
          "Select Cleanup Location",
        ),
      ),



      body:
          Stack(

        children: [



          FlutterMap(

            mapController:
                _mapController,


            options:
                MapOptions(

              initialCenter:
                  _defaultCenter,

              initialZoom:
                  14,


              onTap:
                  handleMapTap,

            ),



            children: [



              TileLayer(

                urlTemplate:
                    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",


                userAgentPackageName:
                    "com.scaledcircle.mobile",

              ),



              if (_selectedPoint != null)

                MarkerLayer(

                  markers: [

                    Marker(

                      point:
                          _selectedPoint!,


                      width:
                          50,


                      height:
                          50,


                      child:
                          const Icon(

                        Icons.location_pin,

                        color:
                            Colors.red,

                        size:
                            50,

                      ),

                    ),

                  ],

                ),


            ],

          ),




          Positioned(

            top:
                15,

            left:
                15,

            right:
                15,


            child:
                Material(

              elevation:
                  5,


              borderRadius:
                  BorderRadius.circular(
                12,
              ),


              child:
                  TextField(

                controller:
                    searchController,


                onSubmitted:
                    (_) => searchAddress(),



                decoration:
                    InputDecoration(

                  hintText:
                      "Search job address...",


                  prefixIcon:
                      const Icon(
                    Icons.search,
                  ),



                  suffixIcon:

                      searching

                      ? const Padding(

                          padding:
                              EdgeInsets.all(12),

                          child:
                              CircularProgressIndicator(
                            strokeWidth:
                                2,
                          ),

                        )


                      : IconButton(

                          icon:
                              const Icon(
                            Icons.arrow_forward,
                          ),

                          onPressed:
                              searchAddress,

                        ),



                  filled:
                      true,


                  border:
                      OutlineInputBorder(

                    borderRadius:
                        BorderRadius.circular(
                      12,
                    ),

                  ),

                ),

              ),

            ),

          ),





          if (_selectedAddress != null)

            Positioned(

              top:
                  90,

              left:
                  20,

              right:
                  20,


              child:
                  Card(

                child:
                    Padding(

                  padding:
                      const EdgeInsets.all(12),

                  child:
                      Text(
                    _selectedAddress!,
                    maxLines:
                        2,
                    overflow:
                        TextOverflow.ellipsis,
                  ),

                ),

              ),

            ),





          Positioned(

            bottom:
                25,

            left:
                20,

            right:
                20,


            child:
                ElevatedButton.icon(

              onPressed:
                  confirmLocation,


              icon:
                  const Icon(
                Icons.check,
              ),


              label:
                  const Text(
                "Confirm Location",
              ),


              style:
                  ElevatedButton.styleFrom(

                minimumSize:
                    const Size(
                  double.infinity,
                  55,
                ),

              ),

            ),

          ),


        ],

      ),

    );

  }

}