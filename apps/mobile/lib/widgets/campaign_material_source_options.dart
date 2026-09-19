import 'package:flutter/material.dart';

const campaignMaterialSourceOptions = <DropdownMenuItem<String>>[
  DropdownMenuItem(
    value: 'business_provided',
    child: Text('I Already Have My Materials'),
  ),
  DropdownMenuItem(
    value: 'scaled_circle_generated',
    child: Text('Create Tracked Materials with Scaled Circle'),
  ),
  DropdownMenuItem(
    value: 'printed_by_scaled_circle',
    enabled: false,
    child: Text('ScaledCircle Printing — Coming Soon'),
  ),
];
