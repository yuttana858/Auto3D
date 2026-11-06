import assert from 'node:assert/strict';
import { AddDiv, CreateDiv, CreateDomElementFromTrustedHtml } from '../source/engine/viewer/domutils.js';

function FakeElement (type)
{
    const element = { type, children : [], className : '', textContent : '', parsed : null, appendChild (child) { this.children.push (child); return child; } };
    Object.defineProperty (element, 'innerHTML', { get () { return this.parsed; }, set (value) { this.parsed = value; } });
    return element;
}
describe ('DOM text safety', () => {
    let saved;
    beforeEach (() => { saved = globalThis.document; globalThis.document = { createElement : FakeElement }; });
    afterEach (() => { globalThis.document = saved; });
    it ('renders model, material and file names as text, never markup', () => {
        const hostile = '<img src=x onerror="fetch(\'/api/personal/items\',{method:\'DELETE\'})">';
        const parent = FakeElement ('div');
        const added = AddDiv (parent, 'ov_tree_item_name', hostile), created = CreateDiv ('name', hostile);
        for (const element of [added, created]) { assert.equal (element.textContent, hostile); assert.equal (element.innerHTML, null); }
        assert.equal (AddDiv (parent, 'empty').textContent, ''); assert.equal (AddDiv (parent, 'number', 0).textContent, '0');
    });
    it ('keeps an explicit trusted-markup helper for fixed icons', () => {
        assert.equal (CreateDomElementFromTrustedHtml ('div', 'icon', '<svg></svg>').innerHTML, '<svg></svg>');
    });
});
