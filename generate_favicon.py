#!/usr/bin/env python3
"""Generate a favicon from the calendar screenshot, removing text."""

from PIL import Image, ImageDraw
import os

# Load the screenshot
input_path = "png_for_favicon.png"
img = Image.open(input_path).convert("RGBA")

width, height = img.size
center_x, center_y = width // 2, height // 2

# The ring appears to be roughly between these radii (as fraction of image size)
# Outer edge of colored ring, inner edge of colored ring
outer_radius = int(min(width, height) * 0.38)
inner_radius = int(min(width, height) * 0.27)

# Create a new image with just the ring (mask out everything else)
result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
mask = Image.new("L", (width, height), 0)
draw = ImageDraw.Draw(mask)

# Draw the ring on the mask (outer circle minus inner circle)
draw.ellipse(
    [center_x - outer_radius, center_y - outer_radius,
     center_x + outer_radius, center_y + outer_radius],
    fill=255
)
draw.ellipse(
    [center_x - inner_radius, center_y - inner_radius,
     center_x + inner_radius, center_y + inner_radius],
    fill=0
)

# Apply mask to original image
result.paste(img, mask=mask)

# Crop to the ring area with small padding
padding = 5
crop_box = (
    center_x - outer_radius - padding,
    center_y - outer_radius - padding,
    center_x + outer_radius + padding,
    center_y + outer_radius + padding
)
result = result.crop(crop_box)

# Generate favicon sizes
sizes = [16, 32, 48, 64, 128, 256]
icons = []

for size in sizes:
    resized = result.resize((size, size), Image.Resampling.LANCZOS)
    icons.append(resized)

# Save as ICO (Windows favicon format with multiple sizes)
icons[0].save(
    "favicon.ico",
    format="ICO",
    sizes=[(s, s) for s in sizes],
    append_images=icons[1:]
)

# Also save PNG versions for modern browsers
result.resize((180, 180), Image.Resampling.LANCZOS).save("apple-touch-icon.png")
result.resize((32, 32), Image.Resampling.LANCZOS).save("favicon-32x32.png")
result.resize((16, 16), Image.Resampling.LANCZOS).save("favicon-16x16.png")

print("Generated:")
print("  - favicon.ico (multi-size)")
print("  - apple-touch-icon.png (180x180)")
print("  - favicon-32x32.png")
print("  - favicon-16x16.png")
