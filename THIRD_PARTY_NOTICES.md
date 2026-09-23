# Third-party notices

This index identifies source code copied or adapted into the repository and the Calendar libraries previously called out here. These permissions belong to their respective rightsholders; they do not change the Apocalypse project's [Apache License 2.0](LICENSE). Original license texts for frontend sources are distributed under `apocalypse-web/public/licenses/` so they remain available with the frontend build. Maven and pnpm dependency graphs also contain other packages governed by their own licenses; a complete release-artifact notice review is still required before formal distribution.

## Adapted frontend source

| Source | Use in this repository | Original permission notice |
| --- | --- | --- |
| [softie-webgpu at 977a608](https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f) | WebGPU slime implementation in `apocalypse-web/src/effects/webgpu/slime/` | [MIT text and attribution](apocalypse-web/public/licenses/softie-webgpu.txt) |
| [8bitcn UI](https://github.com/TheOrcDev/8bitcn-ui) | PixelBubble's stepped border technique | [MIT text and attribution](apocalypse-web/public/licenses/8bitcn-ui.txt) |
| [Magic UI at b7443b4](https://github.com/magicuidesign/magicui/tree/b7443b4780af83a6fe064010a4c6a839202b81d1) | Retained, deprecated RetroGrid adaptation | [MIT text and attribution](apocalypse-web/public/licenses/magic-ui.txt) |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Copied and adapted components in `apocalypse-web/src/components/ui/` | [MIT text and attribution](apocalypse-web/public/licenses/shadcn-ui.txt) |
| [three.js](https://github.com/mrdoob/three.js/tree/r185) | WebGPU rendering dependency, pinned in `apocalypse-web/package.json` | [MIT text and attribution](apocalypse-web/public/licenses/three.txt) |

The earlier React Bits BlurText and SpotlightCard source is no longer included in the current tree. Its upstream MIT + Commons Clause conditions restrict redistribution of the components themselves, so the login text effect now uses a separate local implementation.

## Calendar runtime libraries

Calendar's library types are confined to infrastructure adapters by architecture tests.

## lunar-java 1.7.7

- Project: https://github.com/6tail/lunar-java
- Artifact: `cn.6tail:lunar:1.7.7`
- Copyright (c) 2018 6tail
- License: MIT

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Apache Commons CSV 1.14.1

- Project: https://commons.apache.org/proper/commons-csv/
- Artifact: `org.apache.commons:commons-csv:1.14.1`
- License: Apache License 2.0
- Runtime dependency: `commons-io:commons-io:2.20.0` (Apache License 2.0)
- Runtime dependency: `commons-codec:commons-codec:1.21.0` (Apache License 2.0; version managed by the Spring Boot 4.1.1 BOM)

Apache Commons CSV is confined to the Calendar CSV import adapter under
`io.apocalypse.calendar.infrastructure.importing`. The project declares only the
CSV artifact directly: Commons IO follows the upstream 1.14.1 dependency graph,
while Commons Codec remains controlled by the Spring Boot BOM without a local
version override.
