# Notes

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

10. Remove an issue from the NOTES.md after the issue is fixed: New and existing tests are passing without regressions
11. Commit the changes and push to the remote.

Leave Features, BugFixes, Improvements, Maintenance sections empty when all fixes are implemented but don't delete the sections themselves.

## Issues

## Features

## Improvements

1. The page opnes with 100% termomemeter. It should open at 0%
2. As I brows pages the thermometer nover grows and stays at 0%. The page progress stats works. The progress bar shall grow in proportion to the pages I browsed

- [ ] [SZ-03] Texts have footnotes, often defined as (1) in the text and then (1) later in the text with an explanation but may use a different syntax, such as 1) in the text and 1) later. The defining charchteristic would be a leter reference to that number with an explanation.. Develop a generalized system to detect and display footnotes

- [ ] [SZ-04] Improve the text analysis in reagrds to notes vs text, title and author using @assets/texts/"В. Ф. Одоевский. Городок в табакерке. Текст произведения.txt" which has a different format from @assets/texts/alenkij.txt. Generalize the approch and extract comomonalities in the sahred abstract layer

## BugFixes

- [ ] [SZ-05] TOC does not respect the theme
- [ ] [SZ-06] Text size slider doesn not change the size of text
- [ ] [SZ-07] the second slider does nothing
- [ ] [SZ-08] The page browsing is represented with two pairs of angular brackerts -- in the top bar and on the page side. There must be only one pair of angular brackets, on the sides of the page. 

## Maintenance
