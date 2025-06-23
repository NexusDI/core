#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { Nexus, Token, Service, Inject } from '../../dist/index.js';

// Define a simple service and token
interface IDummy {}
const DUMMY = new Token<IDummy>('DUMMY');

@Service(DUMMY)
class Dummy implements IDummy {}

const ITERATIONS = 10000;
const times: number[] = [];

for (let i = 0; i < ITERATIONS; i++) {
  const container = new Nexus();
  const start = performance.now();
  container.set(DUMMY, { useClass: Dummy });
  const end = performance.now();
  times.push(end - start);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
const min = Math.min(...times);
const max = Math.max(...times);

const toMicro = (ms: number) => ms * 1000;

console.log('Service registration benchmark (container.set):');
console.log(`Iterations: ${ITERATIONS}`);
console.log(`Average: ${toMicro(avg).toFixed(2)}μs`);
console.log(`Min:     ${toMicro(min).toFixed(2)}μs`);
console.log(`Max:     ${toMicro(max).toFixed(2)}μs`); 