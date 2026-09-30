# Third-party notices

These permissions belong to their respective rightsholders; they do not change the Apocalypse project's [Apache License 2.0](LICENSE). Original frontend notices are distributed under `apocalypse-web/public/licenses/` and copied into `apocalypse-web/dist/licenses/`. Source locations below refer to the repository at the commit identified by the candidate manifest; a binary candidate does not include those source directories. Maven and pnpm metadata alone do not establish redistribution compliance; the actual release artifacts and their accompanying notices must be reviewed together.

## Adapted frontend source

| Source                                                                                                                 | Use in this repository                                                                       | Original permission notice                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [softie-webgpu at 977a608](https://github.com/yuanyang749/softie-webgpu/tree/977a60844ac6ffe6824531900cf15bd5403e408f) | WebGPU slime implementation in `apocalypse-web/src/effects/webgpu/slime/`                    | [MIT text and attribution](apocalypse-web/public/licenses/softie-webgpu.txt) |
| [8bitcn UI](https://github.com/TheOrcDev/8bitcn-ui)                                                                    | Historical source of PixelBubble; its current rounded implementation retains the attribution | [MIT text and attribution](apocalypse-web/public/licenses/8bitcn-ui.txt)     |
| [shadcn/ui](https://github.com/shadcn-ui/ui)                                                                           | Copied and adapted components in `apocalypse-web/src/components/ui/`                         | [MIT text and attribution](apocalypse-web/public/licenses/shadcn-ui.txt)     |
| [three.js](https://github.com/mrdoob/three.js/tree/r185)                                                               | WebGPU rendering dependency, pinned in `apocalypse-web/package.json`                         | [MIT text and attribution](apocalypse-web/public/licenses/three.txt)         |

The former Magic UI RetroGrid implementation has been removed and there are no remaining Magic UI consumers in this source tree. React Bits BlurText and SpotlightCard are also absent; their former permissions are not represented as licenses for the current implementation.

## Frontend dependency notices

[Frontend dependency license texts](apocalypse-web/public/licenses/frontend-dependencies.txt) preserve the original copyright and license notices for the installed production dependency graph, plus the Vite module-preload helper and Tailwind generated stylesheet contributions. The [version and source index](apocalypse-web/public/licenses/frontend-dependencies.json) identifies each entry and its original notice hashes. The production graph is a conservative superset: an entry does not imply that every package file or optional feature is present in the browser bundle. Development CLI, lint and test tools are outside this runtime notice scope unless they contribute code to the output.

The `react-remove-scroll-bar` package declares MIT but omits the full license text; its entry includes the rightsholder's full notice from a pinned upstream source. The original npm `gitHead` is unavailable, so that notice is identified as an upstream supplement rather than as a file present in the published package.

## Backend runtime notices

The [backend license and notice texts](src/main/resources/META-INF/licenses/backend-runtime.txt) and [component/source index](src/main/resources/META-INF/licenses/backend-runtime.json) accompany the packaged runtime libraries. Spring Boot retains these files at the executable JAR's root under `META-INF/licenses/`; binary candidates also retain the linked relative paths above. Original notices in nested `BOOT-INF/lib/*.jar` remain intact. The index records upstream JAR hashes, full notice references, and verified source-archive locations for the EPL-covered components; other conventional source URLs are marked when their availability has not been checked. It must be checked against the actual packaged JAR when dependencies change.

JSqlParser is distributed under its Apache-2.0 option. Logback and Jakarta Annotations use their EPL-2.0 option; their unmodified source archives and the AspectJ source archive are available at the versioned upstream locations in the index. AspectJ also includes BSD-3-Clause and Apache-1.1 portions. These libraries retain their own terms and are not relicensed by the project's Apache-2.0 license.

Package metadata can omit file-level terms. Netty's original notice and companion texts are retained, including its descriptions of optional components; this does not assert that every optional/native component is bundled here.

The Swagger UI WebJar contains prebuilt JavaScript in addition to Java runtime dependencies. Its missing license sidecars are included in the backend notices from the byte-identical official `swagger-ui-dist@5.32.14` distribution. The embedded-component appendix distinguishes same-tag lockfile version inferences from package identity verified against the actual WebJar. It explicitly identifies components whose bundled versions could not be established; it is not a verified complete component-version SBOM. Disabling OpenAPI/Swagger UI endpoints does not remove these files from the JAR or their redistribution obligations.

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
