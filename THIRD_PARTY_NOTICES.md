# Third-party notices

Calendar v1 adds the following runtime libraries. Their types are confined to Calendar infrastructure adapters by architecture tests.

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
