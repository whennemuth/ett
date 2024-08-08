import { deepEqual } from "./Utils";


describe('Utils', () => {

  it('Should accurately declare two objects equal: basic', () => {
    const obj1 = { one: 'one', two: 2, three: false };
    const obj2 = { three: false, two: 2, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(true);
  });

  it('Should accurately declare two objects equal: medium', () => {
    const child1 = { four: 'four', five: { six: 6 }, seven:{}}
    const child2 = { five: { six: 6 }, four: 'four', seven:{}}
    const obj1 = { one: 'one', two: 2, three: false, child: child1 };
    const obj2 = { child:child2, three: false, two: 2, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(true);
  });

  it('Should accurately declare two objects equal: complex', () => {
    const child1 = { four: 'four', five: { six: 6 }, seven:{}, eight: [], nine: [
      { one: 'one', two: 2, three: { four: 'four' }},
      { five: 5, six: true, seven:[]}
    ]}
    const child2 = { nine: [
      { two: 2, one: 'one', three: { four: 'four' }},
      { six: true, five: 5, seven:[]}
    ], eight:[], five: { six: 6 }, four: 'four', seven:{}}
    const obj1 = { one: 'one', two: 2, three: false, child: child1 };
    const obj2 = { child:child2, three: false, two: 2, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(true);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(true);
  });


  it('Should accurately declare two objects unequal: basic', () => {
    const obj1 = { one: 'one', two: 2, three: false };
    const obj2 = { three: false, two: 22, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(false);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(false);
  });

  it('Should accurately declare two objects unequal: medium', () => {
    const child1 = { four: 'four', five: { six: 6 }, seven:{}}
    const child2 = { five: { six: 6 }, four: '_four', seven:{}}
    const obj1 = { one: 'one', two: 2, three: false, child: child1 };
    const obj2 = { child:child2, three: false, two: 2, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(false);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(false);
  });

  it('Should accurately declare two objects unequal: complex', () => {
    const child1 = { four: 'four', five: { six: 6 }, seven:{}, eight: [], nine: [
      { one: 'one', two: 2, three: { four: 'four' }},
      { five: 5, six: true, seven:[]}
    ]}
    const child2 = { nine: [
      { two: 2, one: 'one', three: { four: 'four' }},
      { six: true, five: 5, seven:[ { eight: 8 }]}
    ], eight:[], five: { six: 6 }, four: 'four', seven:{}}
    const obj1 = { one: 'one', two: 2, three: false, child: child1 };
    const obj2 = { child:child2, three: false, two: 2, one: 'one' };
    expect(deepEqual(obj1, obj2)).toBe(false);
    expect(deepEqual(obj1, obj2, 'alt')).toBe(false);
  });
})