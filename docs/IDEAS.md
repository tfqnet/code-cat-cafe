# Ideas (not planned, not scheduled)

## 3D cats, maybe not an office (noted 31 Oct 2026)

The owner wants to try a new look for the cat world: 3D instead of pixel art, but still cats, and still running in the browser.

- **It may not be an office anymore.** It could become a village, a playground, or another scene. The "office" is only the current setting; keep the idea open.
- **Tech the owner saw and likes:** Three.js (WebGL) in the existing Vite + TypeScript web app. Alternatives: Babylon.js; or cheaper "3D-looking" options (isometric or pre-rendered 3D sprites from Blender, Rive/Lottie vector cats).
- **Hard part is the cat assets, not the code:** 3D cat models (one per role: lead, planner, designer, developer, tester) with walk, sit, sleep and typing animations, plus the scene props. Sources: stock or marketplace models (check licences), commissioning an artist, or generating them. Rigging and animating is the slow part.
- **What may carry over:** from the file names, the logic (`web/src/director.ts`, `feed.ts`: what each cat is doing, the events) looks separate from the drawing (`render.ts`, `world.ts`). A new renderer could reuse the same events and cat states. Not verified: read those files before promising anything.
- **Costs to expect:** bigger download (Three.js is a few hundred KB), more GPU use on older laptops, keeping cats readable at small size.
- **Suggested first step when it is time:** a one-cat Three.js prototype to check the look before building a whole scene.
