import 'package:flutter/material.dart';
import '../../../services/campaign_service.dart';
import '../../../models/campaign_model.dart';
import 'scaler_campaign_details_screen.dart';


class ScalerAppliedCampaignsScreen extends StatelessWidget {

  ScalerAppliedCampaignsScreen({
    super.key,
  });


  final CampaignService _campaignService =
      CampaignService();


  @override
  Widget build(BuildContext context) {

    return Scaffold(

      appBar: AppBar(
        title: const Text(
          "Applied Campaigns",
        ),
      ),


      body: StreamBuilder<List<CampaignModel>>(

        stream: _campaignService
            .getScalerApplications(),


        builder: (context, snapshot) {


          if (snapshot.hasError) {

            return Center(

              child: Padding(

                padding:
                    const EdgeInsets.all(24),

                child: Text(

                  "Unable to load applications: ${snapshot.error}",

                  textAlign:
                      TextAlign.center,

                ),

              ),

            );

          }


          if(snapshot.connectionState ==
              ConnectionState.waiting){

            return const Center(
              child:
                  CircularProgressIndicator(),
            );

          }


          if(!snapshot.hasData ||
              snapshot.data!.isEmpty){

            return const Center(

              child: Column(

                mainAxisAlignment:
                    MainAxisAlignment.center,

                children:[

                  Icon(
                    Icons.assignment_outlined,
                    size:60,
                  ),

                  SizedBox(height:15),


                  Text(
                    "No applications yet.",
                    style: TextStyle(
                      fontSize:18,
                    ),
                  ),

                ],

              ),

            );

          }


          final campaigns =
              snapshot.data!;



          return ListView.builder(

            padding:
                const EdgeInsets.all(16),


            itemCount:
                campaigns.length,


            itemBuilder:(context,index){


              final campaign =
                  campaigns[index];


              return Card(

                elevation:4,


                margin:
                    const EdgeInsets.only(
                      bottom:16,
                    ),


                child: Padding(

                  padding:
                      const EdgeInsets.all(18),


                  child: Column(

                    crossAxisAlignment:
                        CrossAxisAlignment.start,


                    children:[


                      Text(

                        campaign.campaignName,

                        style:
                          const TextStyle(
                            fontSize:20,
                            fontWeight:
                                FontWeight.bold,
                          ),

                      ),



                      const SizedBox(height:10),



                      Text(
                        campaign.description,
                      ),



                      const SizedBox(height:15),



                      Row(

                        children:[

                          const Icon(
                            Icons.hourglass_top,
                          ),

                          const SizedBox(width:8),


                          const Text(
                            "Pending Business Approval",
                          ),

                        ],

                      ),



                      const SizedBox(height:15),



                      ElevatedButton(

                        onPressed:(){

                          Navigator.push(

                            context,

                            MaterialPageRoute(

                              builder:(_)=>
                                  ScalerCampaignDetailsScreen(
                                    campaign:
                                      campaign,
                                  ),

                            ),

                          );

                        },


                        child:
                          const Text(
                            "View Campaign",
                          ),

                      ),


                    ],

                  ),

                ),

              );


            },

          );


        },

      ),

    );

  }

}
