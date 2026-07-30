# Gleason's Longitude and Time Calculator, 1892

An interactive replication of Alexander Gleason's 1892 chart, built to show how
the sheet is read as designed: longitude into sun time, and distance taken the
way an azimuthal equidistant projection actually supports.

The sheet names its own purpose in the upper left corner: **Longitude and Time
Calculator**. The patent that covers it, U.S. 497,917, is titled **Time-Chart**.

Static HTML and JavaScript with no build step. Open `index.html` directly, or
serve the directory over HTTP.

## Running it

```sh
python3 -m http.server 8000     # then open http://localhost:8000/
node js/test.js                 # coordinate maths self-check
```

## What it does

| Tool | What it gives |
|---|---|
| Longitude and time | Difference of longitude, difference in sun time at four minutes to the degree, local sun time at each point |
| Distance | Shortest distance through the graticule, against a straight ruler laid on the chart, with the discrepancy stated |
| Ruler arms | Gleason's two indicating arms, pivoted at the pole, with the angle between the meridians read as sun time |
| Recentred view | The scan replotted about point A, where a straight ruler reads correctly |
| Printed scales | Gleason's Figs. 37 and 38 as engraved on the sheet, with live readings against them |
| Worked examples | Seven presets covering the radial case, the off-centre case, recentring and why it works, the cosine of latitude, and the pole drawn as the rim |
| Whole sheet | The full sheet, with the title block, hour dial legend, scale rulers, solstice diagrams and Gleason's printed notes |

Points are set by clicking the chart, by name, or by typing coordinates. The
address bar carries the current measurement, so a particular case can be linked
to: `?a=-33.95,151.18&b=-33.40,-70.79&mode=recentred&zoom=sheet`.

`gallery.html` shows the three copies whole, side by side with their provenance.
Those are shown for what is printed on them; only the reprint used by the chart
page is georeferenced.

## The projection

The patent states the construction outright:

> On the face of the map are circular lines from the center or north pole to
> ninety degrees South representing the latitudes of the earth, both north and
> south of the equator.

> The extorsion of the map from that of a globe consists, mainly in the
> straightening out of the meridian lines allowing each to retain their original
> value from Greenwich, the equator to the two poles.

Straight radial meridians holding true longitude, evenly spaced latitude circles
measured out from the centre: an azimuthal equidistant projection on the north
pole. So

```
r       = (90 - lat) * k          pixels from the centre
bearing = rot - lon               degrees clockwise from image north
```

An equidistant projection is true to scale along radials from its centre and
nowhere else, which is the point the distance tools are built around.

## Georeference

The three parameters were fitted to the scan rather than assumed, by maximising
land and sea agreement against Natural Earth coastlines over the whole disc.

| Parameter | Fitted value |
|---|---|
| Centre | 2968.3, 4549.5 px on the source scan |
| Scale | 12.5260 px per degree of colatitude |
| Greenwich meridian | 90.04° clockwise from image north |
| Land/sea agreement | 98.5% of the disc |

Three independent checks agree with the fit: the sheet prints "Meridian of
Greenwich" running due right and "0 / 24 Hours" at the right edge, giving 90°;
the outermost engraved circle sits where the patent's "ninety degrees South"
predicts it; and the engraved tropics and polar circles land within a few pixels
of their predicted radii. Zoomed checks put the crosshairs on Cape Horn, Cape
Town, the Strait of Gibraltar and Malacca.

Both copies were fitted independently and agree: the reprint's scale stands to
the 1892 impression's in the ratio 1.2513 against a sheet-width ratio of 1.2529,
so the reprint holds the plate geometry to about a tenth of a percent, and both
put Greenwich at 90.0° from image north.

The chart draws its latitude circles every 15°, not every 10°.

## Layout

```
index.html          the chart and its tools
about.html          how the chart works, in plain terms
gallery.html        the copies, shown whole
reference.html      patent and book passages on construction and use
js/geo.js           projection, spherical geometry, recentring, conversions
js/chart.js         canvas view, pan and zoom, raster reprojection
js/app.js           wiring and readouts
js/test.js          self-check, no framework
tools/              one-time asset and georeference scripts (Python)
assets/             chart image, georeference, extracted sheet details
```

`tools/` is not needed to run the site. It produced `assets/` and is kept so the
georeference can be re-derived rather than taken on trust. The archival scans it
reads are not shipped here; download them from the institutions listed under
Sources into a `sources/` directory to re-run the fit.

## Sources

- *Gleason's new standard map of the world*, Alexander Gleason, Buffalo
  Electrotype and Engraving Co., 1892; reprinted by Lone Star Art, 2013.
  American Geographical Society Library, University of Wisconsin–Milwaukee.
  This is the chart the site measures on: it carries no indicating arm across
  the map face.
- The same map, 1892 impression, Norman B. Leventhal Map & Education Center,
  Boston Public Library. No known copyright restrictions. Kept for the
  reference page, where its indicating arm is the point.
- Gleason, A. (1893). *Time-Chart*. U.S. Patent No. 497,917.
- Gleason, A. (1893). *Is the Bible From Heaven? Is the Earth a Globe?* Buffalo,
  N.Y. Chapter XVII, pp. 340–352; Fig. 43, p. 402.
- Natural Earth 1:110m land polygons, public domain. Used to fit the
  georeference only; not drawn on the chart.
