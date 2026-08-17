Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630
$output = Join-Path $PSScriptRoot '..\web\social\scaled-circle-social-preview.png'
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.ColorTranslator]::FromHtml('#020914')
$panel = [System.Drawing.ColorTranslator]::FromHtml('#071525')
$border = [System.Drawing.ColorTranslator]::FromHtml('#143552')
$green = [System.Drawing.ColorTranslator]::FromHtml('#14E39A')
$blue = [System.Drawing.ColorTranslator]::FromHtml('#52A5FF')
$white = [System.Drawing.ColorTranslator]::FromHtml('#F4F8FC')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#B8C9D8')

$graphics.Clear($background)
$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 20, 53, 82), 1)
for ($x = 0; $x -le $width; $x += 72) { $graphics.DrawLine($gridPen, $x, 0, $x, $height) }
for ($y = 0; $y -le $height; $y += 72) { $graphics.DrawLine($gridPen, 0, $y, $width, $y) }

# Approved ScaledCircle mark geometry from web/icons/scaled-circle-mark.svg.
$greenPen = New-Object System.Drawing.Pen($green, 15)
$bluePen = New-Object System.Drawing.Pen($blue, 12)
$graphics.DrawEllipse($greenPen, 62, 56, 92, 92)
$graphics.DrawEllipse($bluePen, 88, 82, 40, 40)
$graphics.FillEllipse((New-Object System.Drawing.SolidBrush($white)), 103, 97, 10, 10)

$brandFont = New-Object System.Drawing.Font('Arial', 28, ([System.Drawing.FontStyle]::Bold))
$headlineFont = New-Object System.Drawing.Font('Arial', 48, ([System.Drawing.FontStyle]::Bold))
$subheadFont = New-Object System.Drawing.Font('Arial', 22, ([System.Drawing.FontStyle]::Regular))
$labelFont = New-Object System.Drawing.Font('Arial', 15, ([System.Drawing.FontStyle]::Bold))
$smallFont = New-Object System.Drawing.Font('Arial', 14, ([System.Drawing.FontStyle]::Regular))
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$mutedBrush = New-Object System.Drawing.SolidBrush($muted)
$greenBrush = New-Object System.Drawing.SolidBrush($green)
$blueBrush = New-Object System.Drawing.SolidBrush($blue)
$panelBrush = New-Object System.Drawing.SolidBrush($panel)
$borderPen = New-Object System.Drawing.Pen($border, 2)

$graphics.DrawString('ScaledCircle', $brandFont, $whiteBrush, 174, 78)
$graphics.DrawString('GROW LOCALLY.', $headlineFont, $whiteBrush, 64, 205)
$graphics.DrawString('WORK LOCALLY.', $headlineFont, $greenBrush, 64, 270)
$graphics.DrawString('SCALE CONFIDENTLY.', $headlineFont, $blueBrush, 64, 335)
$graphics.DrawString('Local growth intelligence + verified field campaigns.', $subheadFont, $mutedBrush, 68, 425)

$graphics.FillRectangle($panelBrush, 780, 70, 350, 490)
$graphics.DrawRectangle($borderPen, 780, 70, 350, 490)
$graphics.DrawString('ONE LOCAL GROWTH SYSTEM', $labelFont, $greenBrush, 814, 106)

$items = @(
  @('FIND OPPORTUNITY', 'Property + weather intelligence'),
  @('CREATE CAMPAIGN', 'Service Area > Target Area > Zone'),
  @('COMPLETE WORK', 'Active-work GPS evidence'),
  @('REVIEW RESULTS', 'Campaign response + proof')
)
$itemY = 168
foreach ($item in $items) {
  $graphics.FillEllipse($greenBrush, 814, $itemY + 3, 14, 14)
  $graphics.DrawString($item[0], $labelFont, $whiteBrush, 850, $itemY - 3)
  $graphics.DrawString($item[1], $smallFont, $mutedBrush, 850, $itemY + 24)
  $itemY += 91
}
$graphics.DrawString('scaledcircle.com', $labelFont, $blueBrush, 68, 548)

$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
