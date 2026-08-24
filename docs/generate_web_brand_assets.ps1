param([string]$Source = (Join-Path $PSScriptRoot '..\apps\mobile\assets\brand\source\scaledcircle-approved-artwork.png'))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$app = Join-Path $PSScriptRoot '..\apps\mobile'
$brand = Join-Path $app 'assets\brand'
$web = Join-Path $app 'web'
$icons = Join-Path $web 'icons'
New-Item -ItemType Directory -Force -Path $brand, $icons | Out-Null

function Remove-WhiteCanvas([System.Drawing.Bitmap]$source, [System.Drawing.Rectangle]$rect) {
  $result = New-Object System.Drawing.Bitmap($rect.Width, $rect.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $rect.Height; $y++) {
    for ($x = 0; $x -lt $rect.Width; $x++) {
      $pixel = $source.GetPixel($rect.X + $x, $rect.Y + $y)
      $minimum = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
      $maximum = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
      $chroma = $maximum - $minimum
      # The supplied raster has a lightly compressed off-white canvas. Remove
      # neutral near-white pixels while retaining colored anti-aliased edges.
      if ($minimum -ge 248 -or ($minimum -ge 220 -and $chroma -le 12)) {
        $result.SetPixel($x, $y, [System.Drawing.Color]::Transparent); continue
      }
      $alpha = if ($minimum -le 235 -or $chroma -ge 18) { 255 } else { [int][Math]::Round((248 - $minimum) * (255 / 13)) }
      $red = $pixel.R; $green = $pixel.G; $blue = $pixel.B
      if ($alpha -lt 255 -and $alpha -gt 0) {
        $red = [int][Math]::Max(0, [Math]::Min(255, 255 - ((255 - $pixel.R) * 255 / $alpha)))
        $green = [int][Math]::Max(0, [Math]::Min(255, 255 - ((255 - $pixel.G) * 255 / $alpha)))
        $blue = [int][Math]::Max(0, [Math]::Min(255, 255 - ((255 - $pixel.B) * 255 / $alpha)))
      }
      $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $red, $green, $blue))
    }
  }
  return $result
}

function Recolor-Opacity([System.Drawing.Bitmap]$source, [System.Drawing.Color]$color) {
  $result = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $result.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($source.GetPixel($x, $y).A, $color.R, $color.G, $color.B))
    }
  }
  return $result
}

function Resize-Bitmap([System.Drawing.Bitmap]$source, [int]$width, [int]$height) {
  $result = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $width, $height)
  } finally { $graphics.Dispose() }
  return $result
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) { $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png) }

function New-Lockup([System.Drawing.Bitmap]$symbol, [System.Drawing.Bitmap]$scaled, [System.Drawing.Bitmap]$circle, [System.Drawing.Color]$wordColor, [string]$path) {
  $height = 145
  $left = Recolor-Opacity $scaled $wordColor
  $right = Recolor-Opacity $circle $wordColor
  $symbolWidth = [int][Math]::Round($symbol.Width * $height / $symbol.Height)
  $smallSymbol = Resize-Bitmap $symbol $symbolWidth $height
  $brandGap = 28; $wordGap = 4
  $result = New-Object System.Drawing.Bitmap(($symbolWidth + $brandGap + $scaled.Width + $wordGap + $circle.Width), $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImageUnscaled($smallSymbol, 0, 0)
    $graphics.DrawImageUnscaled($left, $symbolWidth + $brandGap, 0)
    $graphics.DrawImageUnscaled($right, $symbolWidth + $brandGap + $scaled.Width + $wordGap, 0)
    Save-Png $result $path
  } finally { $graphics.Dispose(); $result.Dispose(); $smallSymbol.Dispose(); $left.Dispose(); $right.Dispose() }
}

$sourceBitmap = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
try {
  $expectedHash = '7FE471F94A00BD5595B9C48EA5EDE2EBF52004FC94B6C31EF65A279735D874FB'
  $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Resolve-Path $Source)).Hash
  if ($actualHash -ne $expectedHash) { throw 'Approved canonical source hash changed.' }
  if ($sourceBitmap.Width -ne 1254 -or $sourceBitmap.Height -ne 1254) { throw 'Approved source dimensions changed.' }
  # Bounds measured from the approved pixels. No artwork is redrawn or vector-traced.
  $symbol = Remove-WhiteCanvas $sourceBitmap ([System.Drawing.Rectangle]::new(342, 160, 550, 582))
  $scaled = Remove-WhiteCanvas $sourceBitmap ([System.Drawing.Rectangle]::new(97, 773, 560, 145))
  $circle = Remove-WhiteCanvas $sourceBitmap ([System.Drawing.Rectangle]::new(704, 773, 460, 145))
  $secondary = Remove-WhiteCanvas $sourceBitmap ([System.Drawing.Rectangle]::new(97, 160, 1068, 837))
  try {
    Save-Png $symbol (Join-Path $brand 'scaledcircle-symbol.png')
    Save-Png $secondary (Join-Path $brand 'scaledcircle-secondary-marketing-lockup.png')
    New-Lockup $symbol $scaled $circle ([System.Drawing.ColorTranslator]::FromHtml('#FFFFFF')) (Join-Path $brand 'scaledcircle-lockup-dark-surface.png')
    New-Lockup $symbol $scaled $circle ([System.Drawing.ColorTranslator]::FromHtml('#062650')) (Join-Path $brand 'scaledcircle-lockup-light-surface.png')
    foreach ($icon in @(
      @{Size=64; Path=(Join-Path $web 'favicon.png'); Scale=.92},
      @{Size=192; Path=(Join-Path $icons 'Icon-192.png'); Scale=.92},
      @{Size=512; Path=(Join-Path $icons 'Icon-512.png'); Scale=.92},
      @{Size=192; Path=(Join-Path $icons 'Icon-maskable-192.png'); Scale=.78},
      @{Size=512; Path=(Join-Path $icons 'Icon-maskable-512.png'); Scale=.78}
    )) {
      $height = [int][Math]::Round($icon.Size * $icon.Scale)
      $width = [int][Math]::Round($symbol.Width * $height / $symbol.Height)
      $resized = Resize-Bitmap $symbol $width $height
      $canvas = New-Object System.Drawing.Bitmap($icon.Size, $icon.Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImageUnscaled($resized, [int](($icon.Size-$width)/2), [int](($icon.Size-$height)/2))
        Save-Png $canvas $icon.Path
      } finally { $graphics.Dispose(); $canvas.Dispose(); $resized.Dispose() }
    }

    $socialPath = Join-Path $web 'social\scaled-circle-social-preview.png'
    New-Item -ItemType Directory -Force -Path (Split-Path $socialPath) | Out-Null
    $socialLockup = [System.Drawing.Bitmap]::FromFile((Join-Path $brand 'scaledcircle-lockup-dark-surface.png'))
    $socialCanvas = New-Object System.Drawing.Bitmap(1200, 630, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $socialGraphics = [System.Drawing.Graphics]::FromImage($socialCanvas)
    try {
      $socialGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#020914'))
      $lockupWidth = 980
      $lockupHeight = [int][Math]::Round($socialLockup.Height * $lockupWidth / $socialLockup.Width)
      $lockup = Resize-Bitmap $socialLockup $lockupWidth $lockupHeight
      try { $socialGraphics.DrawImageUnscaled($lockup, 110, [int]((630-$lockupHeight)/2)); Save-Png $socialCanvas $socialPath }
      finally { $lockup.Dispose() }
    } finally { $socialGraphics.Dispose(); $socialCanvas.Dispose(); $socialLockup.Dispose() }
  } finally { $symbol.Dispose(); $scaled.Dispose(); $circle.Dispose(); $secondary.Dispose() }
} finally { $sourceBitmap.Dispose() }

Write-Output 'Generated transparent ScaledCircle assets from the approved canonical source.'
