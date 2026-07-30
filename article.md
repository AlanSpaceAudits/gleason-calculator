# Gleason's 1892 Longitude and Time Calculator, built as a working simulator

**Try it:** https://alanspaceaudits.github.io/gleason-calculator/

**Source:** https://github.com/AlanSpaceAudits/gleason-calculator

An interactive sim that lets you pick locations yourself, enter lat/lon coordinates manually, or select from common places. Lay the ruler arms between two points and read your longitude difference as sun time, then convert that time into distance between any two locations on the projection.

Seven step lesson plan of worked examples down the left. All the math and conversions down the right, with the numbers substituted so you can follow every step.

If someone is drawing straight lines across a Gleason's map and calling it a debunk, send them here. They are misusing the tool and this shows exactly where.

## The sheet tells you what it is

Printed in the top left corner: **LONGITUDE AND TIME CALCULATOR**.

Gleason patented it as a **Time-Chart**, U.S. Patent 497,917, filed 15 August 1892, granted 23 May 1893. Not a distance chart. A time chart.

The patent also states how it is built:

> On the face of the map are circular lines from the center or north pole to ninety degrees South representing the latitudes of the earth, both north and south of the equator.

> The extorsion of the map from that of a globe consists, mainly in the straightening out of the meridian lines allowing each to retain their original value from Greenwich, the equator to the two poles.

Straight radial meridians each holding its true longitude, latitude circles evenly spaced outward from the centre. That is an azimuthal equidistant projection centred on the north pole. The same projection as the UN emblem and as every polar route chart in use.

## Three numbers run the whole instrument

**15° of longitude = 1 hour of sun time**

**1° of longitude = 4 minutes of sun time**

**1° of arc = 60 geographical miles = 69.16 English miles**

Everything else on the sheet is a way of reading those three off the page without doing arithmetic.

## The chain, start to finish

The chart's output is a difference of sun time. That time is an angle. The angle becomes a distance.

**Δλ = λB − λA**

**Δt = Δλ × 4 min/°**

**cos σ = sin φA · sin φB + cos φA · cos φB · cos Δλ**

**d = σ × 60 n.m.**

Sydney to Santiago, worked:

Δt = 9h 12.1m, so Δλ = 9.2016 h × 15 = **138.02°**

cos σ = −0.207458, so σ = **101.973°**

d = 101.973 × 60 = **6,118 n.m.** = 7,040 statute miles = 11,331 km

The published nonstop distance is about 11,360 km. Agreement to 0.3%.

Haversine is in the sim as a consistency check on that conversion, not as a replacement for it. Both arrangements return the same σ to machine precision.

## What the latitudes are doing there

A difference of longitude is always four minutes of sun time. It is never a fixed distance.

A degree of longitude is 60 miles at the equator, about 50 at 34° of latitude, 30 at 60°, and nothing at all at the pole. Gleason tabulates that shrinkage in his Fig. 43, "Diagram showing Longitude in Miles at any Latitude North or South of the Equator", p. 402.

**along a parallel: d = |Δλ| × 60 × cos φ**

So the two latitudes are what turn the angle between two meridians into the angle between two places. That is the only job they have in the chain.

## The ruler arms

The original came with two arms pivoted at the centre. The sim draws them graduated in degrees of latitude, reading outward from the pole, offset so the inner edge runs through the point rather than sitting under the middle of the card.

The angle between the arms is the difference of longitude. Read it at four minutes to the degree and you have the time. That is the whole operation the patent describes, and every step of it is angular, taken about the pivot.

## Why the straight line fails

An azimuthal equidistant projection is true to scale along radials from its centre. Nowhere else. That is what "equidistant" means and it is the only guarantee the projection makes.

Pole to anywhere reads correctly with a straight edge. Two places on one meridian read correctly, because that line passes through the centre on its way. Sydney to Santiago never comes near the centre, so the ruler there reads 13,856 n.m. against a true 6,118. Over double.

The distance is not set by the picture. It is set by the gridded network of longitude and latitude behind it.

## Recentring

Here is the part that does the work: the centre is not a property of the world. It is a choice made when the projection is drawn. Gleason chose the pole. Nothing stops you choosing Sydney.

The sim replots the actual scan about whatever point you pick. Same engraving, same ink, different centre. Sydney is then in the middle, the line out to Santiago is a radial, and the ruler reads 6,118 n.m. exactly.

Nothing was corrected on the map. The one place the projection can be trusted was moved to the place being measured from. Polar route charts are recentred on the departure airport for exactly this reason.

## One point stretched into a circle

Set A to the north pole and B to the south pole.

A is a dot at the centre. B is drawn as the whole rim, because that is what the projection does to it. Every part of that ring is the south pole, equally.

One dot on a globe projection, one whole circle on this one. Same place, laid out two different ways. Nothing is hidden and nothing is invented. It is stretched.

That also explains the blank ring at the edge of the sheet. Antarctica is not missing because nobody had been there. A continent wrapped around the south pole gets stretched the way the pole does, smeared along the whole rim at a scale that grows without limit as you get closer.

Every map projection is a set of choices about where to put the stretching. Mercator does it to both poles at once, which is why Greenland comes out looking the size of Africa.

## The georeference is fitted, not assumed

The base image is the 1892 plate held at the American Geographical Society Library. Its projection parameters were fitted to the scan by maximising land and sea agreement against coastline data, not taken on trust.

Centre and scale to the pixel, Greenwich at **90.04°** from image north, **98.5%** land and sea agreement across the disc.

Three independent checks confirm it. The sheet prints "Meridian of Greenwich" running due right and "0 / 24 Hours" at the right edge, which gives 90°. The outermost engraved circle sits where the patent's "ninety degrees South" predicts it. The engraved tropics and polar circles land within a few pixels of their predicted radii.

One thing worth knowing if you go looking: the chart rules its latitude circles every 15°, not every 10°.

## Gleason's own figures, as printed

He states the mile relation three times and they do not quite agree.

By definition, 5280 ft against 6075 ft, giving 1.15057. At 69.16 English miles to the degree against 60, giving 1.15267. In Fig. 37, 208 English against 180 nautical, giving 1.15556.

The sim uses the foot definition, because that is a definition rather than a reading taken off a ruler. The spread is about half a mile in two hundred. It is documented in the code and on the reference page rather than smoothed over.

## The lesson plan

Seven worked examples, in order. Longitude into time. Where the radial is exact. The ruler off to one side. Recentre and the ruler is true. Why recentring works. A degree of longitude is not a fixed distance. One point stretched into a circle.

Each one sets both points, names them in the A and B lists, switches the view, and shows the arithmetic.

The Sheets page has all three copies of the 1892 sheet reproduced whole, including the two originals with their indicating arms still pivoted at the centre. The Reference page carries the patent and book passages the whole thing is built on.

Aether Cosmology Research Group.
