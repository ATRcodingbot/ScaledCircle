import 'package:flutter/material.dart';


class ScMapCard extends StatelessWidget {

  final String address;

  final double distance;

  final double latitude;

  final double longitude;

  final VoidCallback onSelectLocation;


  const ScMapCard({

    super.key,

    required this.address,

    required this.distance,

    required this.latitude,

    required this.longitude,

    required this.onSelectLocation,

  });



  bool get hasLocation =>
      latitude != 0 && longitude != 0;



  @override
  Widget build(BuildContext context) {


    return Card(

      child: Padding(

        padding:
            const EdgeInsets.all(16),

        child:
            Column(

          crossAxisAlignment:
              CrossAxisAlignment.start,


          children: [


            Row(

              children: [


                const Icon(
                  Icons.map_outlined,
                ),


                const SizedBox(
                  width: 12,
                ),


                const Expanded(

                  child: Text(

                    "Job Location",

                    style: TextStyle(

                      fontSize: 18,

                      fontWeight:
                          FontWeight.bold,

                    ),

                  ),

                ),


              ],

            ),



            const SizedBox(
              height: 12,
            ),



            Text(

              address.isEmpty

                  ? "No address selected"

                  : address,

            ),



            const SizedBox(
              height: 8,
            ),



            if (hasLocation)

              Text(

                "Coordinates: "
                "${latitude.toStringAsFixed(5)}, "
                "${longitude.toStringAsFixed(5)}",

                style:
                    const TextStyle(
                  fontSize: 12,
                ),

              )

            else

              const Text(

                "Select a map pin for this cleanup job",

                style:
                    TextStyle(
                  color: Colors.grey,
                ),

              ),



            if (distance > 0)

              Padding(

                padding:
                    const EdgeInsets.only(
                  top: 8,
                ),

                child: Text(

                  "Estimated distance: "
                  "${distance.toStringAsFixed(1)} miles",

                ),

              ),



            const SizedBox(
              height: 16,
            ),



            SizedBox(

              width:
                  double.infinity,


              child:
                  ElevatedButton.icon(

                onPressed:
                    onSelectLocation,


                icon:
                    const Icon(
                  Icons.location_on,
                ),


                label:
                    Text(

                  hasLocation

                      ? "Change Location"

                      : "Select Location",

                ),

              ),

            ),


          ],

        ),

      ),

    );

  }

}