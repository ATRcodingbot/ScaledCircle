Add-Type -AssemblyName System.Drawing

$web = Join-Path $PSScriptRoot '..\apps\mobile\web'
$icons = Join-Path $web 'icons'
$social = Join-Path $web 'social'
New-Item -ItemType Directory -Force -Path $social | Out-Null

function New-Graphics([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#020914'))
  return @($bitmap, $graphics)
}

function Draw-Mark($graphics, [float]$x, [float]$y, [float]$size) {
  $green = [System.Drawing.ColorTranslator]::FromHtml('#14E39A')
  $blue = [System.Drawing.ColorTranslator]::FromHtml('#52A5FF')
  $white = [System.Drawing.ColorTranslator]::FromHtml('#F4F8FC')
  $outer = New-Object System.Drawing.Pen($green, [Math]::Max(4, $size * .105))
  $inner = New-Object System.Drawing.Pen($blue, [Math]::Max(3, $size * .082))
  $graphics.DrawEllipse($outer, $x, $y, $size, $size)
  $inside = $size * .43
  $offset = ($size - $inside) / 2
  $graphics.DrawEllipse($inner, $x + $offset, $y + $offset, $inside, $inside)
  $dot = $size * .1
  $graphics.FillEllipse((New-Object System.Drawing.SolidBrush($white)), $x + ($size - $dot) / 2, $y + ($size - $dot) / 2, $dot, $dot)
  $outer.Dispose(); $inner.Dispose()
}

function Save-Icon([int]$size, [string]$path, [float]$scale) {
  $canvas = New-Graphics $size $size
  $bitmap = $canvas[0]; $graphics = $canvas[1]
  $mark = $size * $scale
  Draw-Mark $graphics (($size - $mark) / 2) (($size - $mark) / 2) $mark
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
}

Save-Icon 64 (Join-Path $web 'favicon.png') .66
Save-Icon 192 (Join-Path $icons 'Icon-192.png') .58
Save-Icon 512 (Join-Path $icons 'Icon-512.png') .58
Save-Icon 192 (Join-Path $icons 'Icon-maskable-192.png') .48
Save-Icon 512 (Join-Path $icons 'Icon-maskable-512.png') .48

$canvas = New-Graphics 1200 630
$bitmap = $canvas[0]; $g = $canvas[1]
$surface = [System.Drawing.ColorTranslator]::FromHtml('#071525')
$raised = [System.Drawing.ColorTranslator]::FromHtml('#0B1D30')
$border = [System.Drawing.ColorTranslator]::FromHtml('#173653')
$green = [System.Drawing.ColorTranslator]::FromHtml('#14E39A')
$blue = [System.Drawing.ColorTranslator]::FromHtml('#52A5FF')
$white = [System.Drawing.ColorTranslator]::FromHtml('#F4F8FC')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#9EB2C4')

$grid = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 23, 54, 83), 1)
for ($x = 0; $x -lt 1200; $x += 72) { $g.DrawLine($grid, $x, 0, $x, 630) }
for ($y = 0; $y -lt 630; $y += 72) { $g.DrawLine($grid, 0, $y, 1200, $y) }

Draw-Mark $g 58 44 68
$brand = New-Object System.Drawing.Font('Segoe UI', 31, [System.Drawing.FontStyle]::Bold)
$headline = New-Object System.Drawing.Font('Segoe UI', 35, [System.Drawing.FontStyle]::Bold)
$body = New-Object System.Drawing.Font('Segoe UI', 16)
$label = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)
$value = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
$g.DrawString('Scaled', $brand, (New-Object System.Drawing.SolidBrush($white)), 143, 52)
$g.DrawString('Circle', $brand, (New-Object System.Drawing.SolidBrush($blue)), 249, 52)
$g.DrawString('Smarter local campaigns.', $headline, (New-Object System.Drawing.SolidBrush($white)), 58, 166)
$g.DrawString('Verified in the field.', $headline, (New-Object System.Drawing.SolidBrush($green)), 58, 224)
$g.DrawString('Map territories, estimate homes and pay.', $body, (New-Object System.Drawing.SolidBrush($muted)), 62, 306)
$g.DrawString('Connect with Scalers and verify GPS coverage.', $body, (New-Object System.Drawing.SolidBrush($muted)), 62, 340)
$g.DrawString('MARYLAND EARLY ACCESS', $label, (New-Object System.Drawing.SolidBrush($green)), 62, 428)
$g.DrawString('scaledcircle.com', $label, (New-Object System.Drawing.SolidBrush($blue)), 62, 566)

$g.FillRectangle((New-Object System.Drawing.SolidBrush($surface)), 662, 58, 480, 508)
$g.DrawRectangle((New-Object System.Drawing.Pen($border, 3)), 662, 58, 480, 508)
$g.DrawString('CAMPAIGN OPPORTUNITY MAP', $label, (New-Object System.Drawing.SolidBrush($white)), 704, 94)
$route = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(714, 284), [System.Drawing.PointF]::new(790, 190),
  [System.Drawing.PointF]::new(902, 154), [System.Drawing.PointF]::new(1050, 222),
  [System.Drawing.PointF]::new(1006, 354), [System.Drawing.PointF]::new(866, 394),
  [System.Drawing.PointF]::new(752, 342)
)
$g.FillPolygon((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(58, 40, 126, 255))), $route)
$g.DrawPolygon((New-Object System.Drawing.Pen($blue, 7)), $route)
foreach ($point in $route) {
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($white)), $point.X - 9, $point.Y - 9, 18, 18)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($blue)), $point.X - 5, $point.Y - 5, 10, 10)
}

$metricX = @(692, 842, 992)
$values = @('548', '7.4 mi', '$120')
$labels = @('Estimated homes', 'Walking distance', 'Estimated pay')
for ($i = 0; $i -lt 3; $i++) {
  $g.FillRectangle((New-Object System.Drawing.SolidBrush($raised)), $metricX[$i], 454, 134, 82)
  $g.DrawRectangle((New-Object System.Drawing.Pen($border, 2)), $metricX[$i], 454, 134, 82)
  $g.DrawString($values[$i], $value, (New-Object System.Drawing.SolidBrush($white)), $metricX[$i] + 12, 462)
  $g.DrawString($labels[$i], (New-Object System.Drawing.Font('Segoe UI', 10)), (New-Object System.Drawing.SolidBrush($muted)), $metricX[$i] + 12, 506)
}

$bitmap.Save((Join-Path $social 'scaled-circle-social-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$grid.Dispose(); $brand.Dispose(); $headline.Dispose(); $body.Dispose(); $label.Dispose(); $value.Dispose()
$g.Dispose(); $bitmap.Dispose()
Write-Host 'Generated Scaled Circle web brand assets.'
