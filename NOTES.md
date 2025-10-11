# Notes

## Role

You are a senior front-end engineer. Your task is to **re-evaluate and refactor the repository Gravity Notes** according to the coding standards already written in **AGENTS.md**.

## Context

* AGENTS.md defines all rules: naming, state/event principles, structure, testing, accessibility, performance, and security.
* The repo uses Alpine.js, CDN scripts only, no bundlers.
* Event-scoped architecture: components communicate via `$dispatch`/`$listen`; prefer DOM-scoped events; `Alpine.store` only for true shared domain state.

## Rules of engagement

Review the NOTES.md. Make a plan for autonomously fixing every item under Features, BugFixes, Improvements, Maintenance. Ensure no regressions. Ensure adding tests. Lean into integration tests. Fix every issue. Document the changes.

Fix issues one by one. 
1. Create a new git branch with descriptive name
2. Describe an issue through tests. Ensure that the tests are comprehensive and failing to begin with.
3. Fix the issue
4. Rerun the tests
5. Repeat 2-4 untill the issue is fixed and comprehensive tests are passing
6. Write a nice comprehensive commit message AFTER EACH issue is fixed and tested and covered with tests.
7. Optional: update the README in case the changes warrant updated documentation
8. Optional: ipdate the PRD in case the changes warrant updated product requirements
9. Optional: update the code examples in case the changes warrant updated code examples

Do not work on all issues at once. Work at one issue at a time sequntially. 

10. Mark an issue as done ([X])in the NOTES.md after the issue is fixed: New and existing tests are passing without regressions
11. Commit the changes and push to the remote.

Leave Features, BugFixes, Improvements, Maintenance sections empty when all fixes are implemented but don't delete the sections themselves.

## Issues

## Features

## Improvements

- [X] [SZ-20] Add integration tests to verify that dropdowns (encoding, provider etc) are populated on web app load
- [X] [SZ-21] Add integration tests to verify that all dependent elements are populated when a file is loaded
    - TOC
    - Reading Progress Thermomemeter
    - Page Count (ensure that total page count and current are valid, e.g. current is on 1 and total is what we expect)
    - Only forward button is available on the first page
    - Clicking on forward button moves the page (Reading Progress Thermomemeter, Page Count etc)

## BugFixes

- [X] [SZ-15] Text rendering stops mid story.  the rendered version of [text](<assets/texts/В. Ф. Одоевский. Городок в табакерке. Текст произведения.txt>) ends at "молоточки быстро застучали, колокольчики" for no good reason, as the text continues.
- [X] [SZ-16] Page counting at the bottom nwext to thermometer is broken. It adds pages as the browsing goes, so going to the next page adds 1 to toal pages. Total pages shall be pre-computed, and only change if we change window size, font size etc
- [X] [SZ-17] TOC is not updated after loading another book
- [X] [SZ-19] JS Conosle errors
This site appears to use a scroll-linked positioning effect. This may not work well with asynchronous panning; see https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html for further details and to join the discussion on related tools and features! localhost:8000
Uncaught DOMException: Node.insertBefore: Child to insert before is not a child of this node
    renderPages http://localhost:8000/js/app.js:553
    decodeAndConsume http://localhost:8000/js/app.js:120
    onload http://localhost:8000/js/app.js:78
app.js:553
Uncaught DOMException: Node.insertBefore: Child to insert before is not a child of this node
    renderPages http://localhost:8000/js/app.js:553
    decodeAndConsume http://localhost:8000/js/app.js:120
    repaginateIfNeeded http://localhost:8000/js/app.js:981
    init http://localhost:8000/js/app.js:45
2 app.js:553


## Maintenance
