import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';


import '../../../widgets/scaled_circle/campaign/sc_campaign_header.dart';
import '../../../widgets/scaled_circle/campaign/sc_map_card.dart';
import '../../../widgets/scaled_circle/campaign/sc_verification_card.dart';
import '../../../widgets/scaled_circle/campaign/sc_payment_card.dart';
import '../../../widgets/scaled_circle/campaign/sc_photo_requirement_card.dart';

import 'cleanup_location_picker_screen.dart';
import '../../../widgets/scaled_circle/campaign/sc_campaign_summary_card.dart';
import '../../../services/campaign_service.dart';

class CleanupCampaignScreen extends StatefulWidget {
  const CleanupCampaignScreen({super.key});

  @override
  State<CleanupCampaignScreen> createState() =>
      _CleanupCampaignScreenState();
}

class _CleanupCampaignScreenState
    extends State<CleanupCampaignScreen> {

  final _formKey = GlobalKey<FormState>();

  final nameController = TextEditingController();
  final descriptionController = TextEditingController();
  final addressController = TextEditingController();
  final payController = TextEditingController();
  final bonusController = TextEditingController();
  final CampaignService _campaignService =
    CampaignService();
  final scalerController =
      TextEditingController(text: "1");

  DateTime? deadline;

  bool requireBeforePhoto = true;
  bool requireAfterPhoto = true;
  bool requireBusinessApproval = true;

  double latitude = 0;
  double longitude = 0;
  double estimatedDistance = 0;


  @override
  void dispose() {

    nameController.dispose();
    descriptionController.dispose();
    addressController.dispose();
    payController.dispose();
    bonusController.dispose();
    scalerController.dispose();

    super.dispose();
  }



  Future<void> pickDeadline() async {

    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now(),
      lastDate: DateTime(2035),
      initialDate: DateTime.now(),
    );


    if (picked != null && mounted) {

      setState(() {

        deadline = picked;

      });

    }
  }

  Future<void> pickCleanupLocation() async {

  final selectedLocation =
      await Navigator.push<CleanupLocationResult>(
    context,
    MaterialPageRoute(
      builder: (_) =>
          const CleanupLocationPickerScreen(),
    ),
  );


  if (selectedLocation == null || !mounted) {
    return;
  }


  setState(() {

    latitude =
        selectedLocation.point.latitude;

    longitude =
        selectedLocation.point.longitude;

    addressController.text =
        selectedLocation.address;

  });

}


  Future<void> createCleanupCampaign() async {


    if (!_formKey.currentState!.validate()) {
      return;
    }


    final user =
        FirebaseAuth.instance.currentUser;


    if (user == null) {

      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content:
              Text("You must be logged in."),
        ),
      );

      return;
    }


    try {


      await _campaignService.createCampaign({

        "businessId": user.uid,

        "businessEmail": user.email,


        "campaignType":
            "job_cleanup",


        "campaignName":
            nameController.text.trim(),


        "description":
            descriptionController.text.trim(),



        "verification": {

          "type":
              "photo_verification",

          "beforePhotoRequired":
              requireBeforePhoto,

          "afterPhotoRequired":
              requireAfterPhoto,

          "businessApprovalRequired":
              requireBusinessApproval,

        },


        "tracking": {

          "gpsRequired":
              false,

          "locationRequired":
              true,

        },


        "location": {

         "address":
    addressController.text.trim(),

          "latitude":
              latitude,

          "longitude":
              longitude,

          "estimatedDistance":
              estimatedDistance,

        },


        "requestedScalerCount":
            int.tryParse(
                  scalerController.text.trim(),
                ) ??
                1,


        "basePay":
            double.tryParse(
                  payController.text.trim(),
                ) ??
                0,


        "bonus":
            double.tryParse(
                  bonusController.text.trim(),
                ) ??
                0,


        "deadline":
            deadline == null
                ? null
                : Timestamp.fromDate(deadline!),


        "status":
            "open",


        "applications":
            0,


        "assignedScalerCount":
            0,


        "createdAt":
            FieldValue.serverTimestamp(),


        "updatedAt":
            FieldValue.serverTimestamp(),

      });



      if (!mounted) return;


      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content:
              Text(
            "Cleanup campaign created!",
          ),
        ),
      );


      Navigator.pop(context);


    } catch (e) {


      if (!mounted) return;


      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content:
              Text(
            e.toString(),
          ),
        ),
      );

    }

  }





  @override
  Widget build(BuildContext context) {


    final pay =
        double.tryParse(
              payController.text.trim(),
            ) ??
            0;


    final bonus =
        double.tryParse(
              bonusController.text.trim(),
            ) ??
            0;


    final scalers =
        int.tryParse(
              scalerController.text.trim(),
            ) ??
            1;



    return Scaffold(

      appBar: AppBar(
        title:
            const Text(
          "Cleanup Campaign",
        ),
      ),



      body: Form(

        key: _formKey,


        child: ListView(

          padding:
              const EdgeInsets.all(20),


          children: [



            ScCampaignHeader(
  icon: Icons.cleaning_services_outlined,

  title: "Job Site Cleanup",

  campaignType: "Cleanup Campaign",

  description:
      "Create a verified cleanup job for Scalers.",

  locationText:
      addressController.text.isEmpty
          ? "Add job site location"
          : addressController.text,

  pay: pay,

  scalerCount: scalers,
),




            const SizedBox(height:24),



            TextFormField(

              controller:
                  nameController,


              decoration:
                  const InputDecoration(

                labelText:
                    "Campaign Name",

                border:
                    OutlineInputBorder(),

              ),


              validator:
                  (value) {

                if (value == null ||
                    value.trim().isEmpty) {

                  return "Required";

                }

                return null;

              },

            ),




            const SizedBox(height:20),



            TextFormField(

              controller:
                  descriptionController,


              maxLines:
                  4,


              decoration:
                  const InputDecoration(

                labelText:
                    "Cleanup Instructions",

                border:
                    OutlineInputBorder(),

              ),

            ),




            const SizedBox(height:20),




            TextFormField(

              controller:
                  addressController,


              onChanged:
                  (_) {

                setState(() {});

              },


              decoration:
                  const InputDecoration(

                labelText:
                    "Job Site Address",

                prefixIcon:
                    Icon(
                  Icons.location_on,
                ),

                border:
                    OutlineInputBorder(),

              ),



              validator:
                  (value) {

                if (value == null ||
                    value.trim().isEmpty) {

                  return "Required";

                }

                return null;

              },

            ),




            const SizedBox(height:20),




           ScMapCard(
  address:
      addressController.text.isEmpty
          ? "No location selected"
          : addressController.text,

  distance:
      estimatedDistance,

  latitude:
      latitude,

  longitude:
      longitude,

  onSelectLocation:
      pickCleanupLocation,
),
const SizedBox(height: 12),

ElevatedButton.icon(
  onPressed: pickCleanupLocation,

  icon: const Icon(
    Icons.map,
  ),

  label: Text(
    addressController.text.isEmpty
        ? "Select Job Location"
        : "Change Location",
  ),
),




            const SizedBox(height:20),




            ScVerificationCard(
  beforePhotoRequired: requireBeforePhoto,
  afterPhotoRequired: requireAfterPhoto,
  businessApprovalRequired: requireBusinessApproval,

  onBeforePhotoChanged: (value) {
    setState(() {
      requireBeforePhoto = value;
    });
  },

  onAfterPhotoChanged: (value) {
    setState(() {
      requireAfterPhoto = value;
    });
  },

  onBusinessApprovalChanged: (value) {
    setState(() {
      requireBusinessApproval = value;
    });
  },
),




            const SizedBox(height:20),




            ScPhotoRequirementCard(

              beforePhotoRequired:
                  requireBeforePhoto,


              afterPhotoRequired:
                  requireAfterPhoto,

            ),




            const SizedBox(height:20),




            TextFormField(

              controller:
                  scalerController,


              keyboardType:
                  TextInputType.number,


              onChanged:
                  (_) {

                setState(() {});

              },


              decoration:
                  const InputDecoration(

                labelText:
                    "Scalers Needed",

                border:
                    OutlineInputBorder(),

              ),


              validator:
                  (value) {

                final number =
                    int.tryParse(
                      value ?? "",
                    );


                if (number == null ||
                    number < 1) {

                  return "Enter at least 1 Scaler";

                }


                return null;

              },

            ),




            const SizedBox(height:20),




            TextFormField(

              controller:
                  payController,


              keyboardType:
                  TextInputType.number,


              onChanged:
                  (_) {

                setState(() {});

              },


              decoration:
                  const InputDecoration(

                labelText:
                    "Base Pay",

                prefixText:
                    "\$",

                border:
                    OutlineInputBorder(),

              ),

            ),




            const SizedBox(height:20),




            TextFormField(

              controller:
                  bonusController,


              keyboardType:
                  TextInputType.number,


              onChanged:
                  (_) {

                setState(() {});

              },


              decoration:
                  const InputDecoration(

                labelText:
                    "Completion Bonus",

                prefixText:
                    "\$",

                border:
                    OutlineInputBorder(),

              ),

            ),




            const SizedBox(height:20),




            ScPaymentCard(

              basePay:
                  pay,

              bonus:
                  bonus,

            ),

            ScCampaignSummaryCard(

  campaignName:
      nameController.text.isEmpty
          ? "Unnamed Campaign"
          : nameController.text,

  campaignType:
      "Job Site Cleanup",

  location:
      addressController.text.isEmpty
          ? "No location selected"
          : addressController.text,

  scalerCount:
      scalers,

  pay:
      pay,

  bonus:
      bonus,

  beforePhoto:
      requireBeforePhoto,

  afterPhoto:
      requireAfterPhoto,

  businessApproval:
      requireBusinessApproval,

),


const SizedBox(height:20),




            const SizedBox(height:20),




            ElevatedButton.icon(

              onPressed:
                  pickDeadline,


              icon:
                  const Icon(
                Icons.calendar_month,
              ),


              label:
                  Text(

                deadline == null

                    ? "Select Deadline"

                    :

                "${deadline!.month}/${deadline!.day}/${deadline!.year}",

              ),

            ),




            const SizedBox(height:30),




            SizedBox(

              height:
                  56,


              child:
                  ElevatedButton.icon(

                onPressed:
                    createCleanupCampaign,


                icon:
                    const Icon(
                  Icons.rocket_launch,
                ),


                label:
                    const Text(
                  "Launch Cleanup Campaign",
                ),

              ),

            ),

          ],

        ),

      ),

    );

  }

}