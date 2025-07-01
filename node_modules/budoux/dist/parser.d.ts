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
/**
 * Base BudouX parser.
 */
export declare class Parser {
    /** BudouX model data */
    private readonly model;
    private readonly baseScore;
    /**
     * Constructs a BudouX parser.
     * @param model A model data.
     */
    constructor(model: {
        [key: string]: {
            [key: string]: number;
        };
    });
    /**
     * Parses the input sentence and returns a list of semantic chunks.
     *
     * @param sentence An input sentence.
     * @return The retrieved chunks.
     */
    parse(sentence: string): string[];
    /**
     * Parses the input sentence and returns a list of boundaries.
     *
     * @param sentence An input sentence.
     * @return The list of boundaries.
     */
    parseBoundaries(sentence: string): number[];
}
