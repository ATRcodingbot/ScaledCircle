import 'package:flutter/material.dart';

class ScCampaignSummaryCard extends StatelessWidget {
  final String campaignName;
  final String campaignType;
  final String location;

  final int scalerCount;

  final double pay;
  final double bonus;

  final bool beforePhoto;
  final bool afterPhoto;
  final bool businessApproval;


  const ScCampaignSummaryCard({
    super.key,

    required this.campaignName,
    required this.campaignType,
    required this.location,

    required this.scalerCount,

    required this.pay,
    required this.bonus,

    required this.beforePhoto,
    required this.afterPhoto,
    required this.businessApproval,
  });



  @override
  Widget build(BuildContext context) {

    final total =
        pay + bonus;


    return Card(

      elevation: 5,

      shape:
          RoundedRectangleBorder(
        borderRadius:
            BorderRadius.circular(22),
      ),


      child: Padding(

        padding:
            const EdgeInsets.all(20),


        child: Column(

          crossAxisAlignment:
              CrossAxisAlignment.start,


          children: [


            Row(

              children: [


                Container(

                  padding:
                      const EdgeInsets.all(12),


                  decoration:
                      BoxDecoration(

                    borderRadius:
                        BorderRadius.circular(14),

                    color:
                        Colors.blue.withValues(
                      alpha: .12,
                    ),

                  ),


                  child:
                      const Icon(
                    Icons.preview,
                  ),

                ),


                const SizedBox(width:12),


                const Expanded(

                  child: Text(

                    "Campaign Preview",

                    style:
                        TextStyle(

                      fontSize:22,

                      fontWeight:
                          FontWeight.bold,

                    ),

                  ),

                ),


                Container(

                  padding:
                      const EdgeInsets.symmetric(
                    horizontal:10,
                    vertical:6,
                  ),


                  decoration:
                      BoxDecoration(

                    borderRadius:
                        BorderRadius.circular(20),

                    color:
                        Colors.green.withValues(
                      alpha:.12,
                    ),

                  ),


                  child:
                      const Text(
                    "READY",
                    style:
                        TextStyle(
                      fontWeight:
                          FontWeight.bold,
                    ),
                  ),

                ),

              ],

            ),



            const SizedBox(height:24),



            _infoRow(
              Icons.cleaning_services,
              campaignType,
            ),



            _infoRow(
              Icons.business,
              campaignName,
            ),



            _infoRow(
              Icons.location_on,
              location,
            ),



            const Divider(
              height:32,
            ),



            _infoRow(
              Icons.groups,
              "$scalerCount Scalers Needed",
            ),



            _infoRow(
              Icons.payments,
              "\$${pay.toStringAsFixed(2)} Base Pay",
            ),



            _infoRow(
              Icons.card_giftcard,
              "\$${bonus.toStringAsFixed(2)} Completion Bonus",
            ),



            _infoRow(
              Icons.account_balance_wallet,
              "\$${total.toStringAsFixed(2)} Total Incentive",
            ),



            const Divider(
              height:32,
            ),



            const Text(

              "Verification Requirements",

              style:
                  TextStyle(

                fontSize:16,

                fontWeight:
                    FontWeight.bold,

              ),

            ),



            const SizedBox(height:10),



            _checkRow(
              "Before Photo",
              beforePhoto,
            ),



            _checkRow(
              "After Photo",
              afterPhoto,
            ),



            _checkRow(
              "Business Approval",
              businessApproval,
            ),


          ],

        ),

      ),

    );

  }





  Widget _infoRow(
    IconData icon,
    String text,
  ) {

    return Padding(

      padding:
          const EdgeInsets.symmetric(
        vertical:6,
      ),


      child: Row(

        children: [


          Icon(
            icon,
            size:20,
          ),


          const SizedBox(width:12),


          Expanded(

            child:
                Text(
              text,
              style:
                  const TextStyle(
                fontSize:15,
              ),
            ),

          ),

        ],

      ),

    );

  }





  Widget _checkRow(
    String label,
    bool enabled,
  ) {

    return Padding(

      padding:
          const EdgeInsets.symmetric(
        vertical:5,
      ),


      child: Row(

        children: [


          Icon(

            enabled
                ? Icons.check_circle
                : Icons.cancel,

            size:20,

          ),



          const SizedBox(width:10),



          Text(label),


        ],

      ),

    );

  }

}