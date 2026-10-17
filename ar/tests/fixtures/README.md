# Test fixtures

Real photos used only by the browser tests (`ar/tests/browser/ai.spec.ts`) as fake camera
frames, so the real COCO-SSD model is exercised on real objects. They are not shipped in the
app. Both are from Wikimedia Commons, released under CC0 1.0 (public domain dedication), and
scaled to 960 px wide:

- `book.jpg`: "The Book of Happy (Unsplash).jpg",
  https://commons.wikimedia.org/wiki/File:The_Book_of_Happy_(Unsplash).jpg
- `mug.jpg`: "Coffee Mug (Unsplash).jpg",
  https://commons.wikimedia.org/wiki/File:Coffee_Mug_(Unsplash).jpg
