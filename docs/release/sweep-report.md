# Generator sweep report (CP10 B2)

The nightly-equivalent sweep: 10 000 seeds per difficulty on the final difficulty table
(CP04 T1, unchanged since CP04), `GENERATOR_VERSION = 1`. Command:

```sh
for d in easy medium hard; do pnpm gen sweep --difficulty $d --count 10000; done
```

Run on 2026-10-14 in the cloud sandbox (Linux x64, Node 22); CI runs the same sweeps on every
push. The sweep fails on any invalid level, a retry rate of 2 % or more, or more than 0.1 % of
rooms missing a required item.

| Difficulty | Invalid levels | Generation errors | Retried levels | Rooms missing a required item                   | ms per level (p50 / p95 / max) |
| ---------- | -------------- | ----------------- | -------------- | ----------------------------------------------- | ------------------------------ |
| Easy       | 0              | 0                 | 118 (1.18 %)   | 29 of 90009 (0.032 %): bathroom: washbasin ×29  | 5.03 / 10.87 / 230.59          |
| Medium     | 0              | 0                 | 61 (0.61 %)    | 73 of 139955 (0.052 %): bathroom: washbasin ×73 | 8.25 / 17.60 / 644.02          |
| Hard       | 0              | 0                 | 13 (0.13 %)    | 87 of 210295 (0.041 %): bathroom: washbasin ×87 | 12.00 / 22.32 / 287.29         |

All three passed (exit code 0). The golden seeds are unchanged (`pnpm gen golden`:
"golden: unchanged"), and frozen from this release on: any change to generator output needs
a `GENERATOR_VERSION` bump.

A bathroom without its washbasin is the only missing required item: 0.03–0.05 % of rooms,
when the furnisher finds no place for it. The sweep allows up to 0.1 %.

## Full output

```text
### easy
sweep easy: 10000 seeds from E1-0000-0000
  invalid levels     0
  rooms missing a required item  29 of 90009 (0.032 %): bathroom: washbasin ×29
  generation errors  0
  retried levels     118 (1.18 %)  attempts 10119
  ms per level       p50 5.03  p95 10.87  max 230.59
  ms per attempt     p50 5.01  p95 10.61
  failed attempts:
       119  V#: metric asymmetricShare = # is outside #–#
  metric distributions (value:count):
    asymmetricShare  (‰, 50-wide buckets) 0:919 50:2849 100:3791 150:1706 200:683 250:52
    doors            18:9 19:11 20:286 21:185 22:1493 23:424 24:1933 25:793 26:1511 27:825 28:1273 29:502 30:535 31:125 32:72 33:17 34:6
    links            17:2 18:13 19:135 20:240 21:882 22:934 23:1194 24:1362 25:1128 26:1188 27:1044 28:881 29:518 30:325 31:93 32:47 33:11 34:3
    longBackLinks    0:5098 1:4902
    misleadingDoors  2:80 3:825 4:2401 5:3062 6:2329 7:1034 8:243 9:26
    missingRequired  0:9971 1:29
    rooms            8:3293 9:3405 10:3302
    sealedDoors      0:4873 1:5127
    selfLinks        0:10000
    shortest         4:5029 5:4971
    twins            0:10000
exit code 0
### medium
sweep medium: 10000 seeds from M1-0000-0000
  invalid levels     0
  rooms missing a required item  73 of 139955 (0.052 %): bathroom: washbasin ×73
  generation errors  0
  retried levels     61 (0.61 %)  attempts 10061
  ms per level       p50 8.25  p95 17.60  max 644.02
  ms per attempt     p50 8.23  p95 17.31
  failed attempts:
        55  V#: metric asymmetricShare = # is outside #–#
         5  V#: metric misleadingDoors = # is outside #–#
         1  layer capacity could not be balanced
  metric distributions (value:count):
    asymmetricShare  (‰, 50-wide buckets) 300:112 350:1020 400:3285 450:3281 500:1892 550:380 600:30
    doors            29:1 30:9 31:27 32:33 33:82 34:133 35:235 36:281 37:396 38:514 39:528 40:628 41:604 42:604 43:625 44:628 45:635 46:614 47:598 48:570 49:501 50:505 51:394 52:285 53:201 54:170 55:95 56:62 57:19 58:19 59:3 60:1
    links            27:3 28:12 29:23 30:58 31:56 32:154 33:232 34:295 35:394 36:500 37:557 38:578 39:599 40:613 41:638 42:603 43:643 44:640 45:572 46:548 47:534 48:474 49:404 50:265 51:227 52:165 53:97 54:62 55:37 56:9 57:7 58:1
    longBackLinks    2:4995 3:5005
    misleadingDoors  3:55 4:239 5:678 6:1451 7:2048 8:2093 9:1635 10:1071 11:485 12:181 13:52 14:11 15:1
    missingRequired  0:9935 1:57 2:8
    rooms            12:2006 13:2001 14:2015 15:1988 16:1990
    sealedDoors      1:3347 2:3257 3:3396
    selfLinks        1:5076 2:4924
    shortest         6:4941 7:5059
    twins            1:5101 2:4899
exit code 0
### hard
sweep hard: 10000 seeds from H1-0000-0000
  invalid levels     0
  rooms missing a required item  87 of 210295 (0.041 %): bathroom: washbasin ×87
  generation errors  0
  retried levels     13 (0.13 %)  attempts 10013
  ms per level       p50 12.00  p95 22.32  max 287.29
  ms per attempt     p50 11.99  p95 22.23
  failed attempts:
        10  V#: metric misleadingDoors = # is outside #–#
         3  V#: metric asymmetricShare = # is outside #–#
  metric distributions (value:count):
    asymmetricShare  (‰, 50-wide buckets) 600:51 650:1223 700:5719 750:2859 800:144 850:4
    doors            57:3 58:6 59:29 60:69 61:108 62:194 63:278 64:339 65:372 66:365 67:364 68:363 69:396 70:405 71:419 72:401 73:370 74:401 75:408 76:399 77:418 78:423 79:385 80:441 81:383 82:402 83:371 84:350 85:294 86:296 87:192 88:148 89:104 90:67 91:24 92:11 93:2
    links            52:2 53:10 54:24 55:57 56:107 57:157 58:211 59:270 60:356 61:360 62:395 63:378 64:383 65:406 66:397 67:362 68:411 69:417 70:376 71:406 72:403 73:427 74:426 75:411 76:404 77:382 78:395 79:323 80:341 81:253 82:245 83:211 84:127 85:78 86:47 87:29 88:8 89:5
    longBackLinks    4:2514 5:2382 6:2538 7:2566
    misleadingDoors  6:63 7:210 8:496 9:922 10:1308 11:1632 12:1664 13:1431 14:1038 15:679 16:341 17:151 18:45 19:15 20:5
    missingRequired  0:9933 1:47 2:20
    rooms            18:1388 19:1412 20:1422 21:1446 22:1448 23:1395 24:1489
    sealedDoors      3:2538 4:2489 5:2462 6:2511
    selfLinks        2:3311 3:3290 4:3399
    shortest         8:3252 9:3361 10:3387
    twins            3:3291 4:3307 5:3402
exit code 0
```
