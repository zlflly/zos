"use strict";
/**
 * @license
 * Copyright 2021 Google LLC
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudouXJapaneseElement = void 0;
const index_js_1 = require("../index.js");
const budoux_base_js_1 = require("./budoux-base.js");
/**
 * BudouX Japanese Web component.
 */
class BudouXJapaneseElement extends budoux_base_js_1.BudouXBaseElement {
    /**
     * BudouX Japanese Web component constructor.
     */
    constructor() {
        super();
        this.parser = (0, index_js_1.loadDefaultJapaneseParser)();
    }
}
exports.BudouXJapaneseElement = BudouXJapaneseElement;
customElements.define('budoux-ja', BudouXJapaneseElement);
//# sourceMappingURL=budoux-ja.js.map