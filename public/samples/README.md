# 文件样例

这些是导入演示与边界测试数据，不代表任何平台账户、授权或收藏历史。

| 文件 | 预期 |
| --- | --- |
| playlist.csv / playlist.json / playlist.txt | 各 3 条合法歌曲；合在一起 9 → 3，每首保留 3 条文件来源 |
| duplicates.json | 3 条跨来源/大小写/Unicode 重复 → 1 首；test-qq-1/test-ne-1 是测试 ID |
| versions.json | 4 条虚构测试录音，原版/Live/Remix/Acoustic 各保留 |
| empty.txt | 0 字节，返回“文件为空” |
| broken.json | 尾逗号损坏，返回 JSON 格式错误 |
| broken.csv | 未闭合引号，返回 CSV 格式错误 |
| ambiguous.txt | 1 条合法、2 条格式/歧义错误 |
| quoted.csv | 1 条带逗号和转义引号的合法虚构记录 |
| invalid-rows.csv | 1 条合法，1 条缺标题，1 条列数错误 |

前三首展示曲目及专辑沿用项目规则：Radiohead / Let Down / OK Computer；Slowdive / Alison / Souvlaki；King Crimson / Starless / Red。未填写未经核实的 ISRC、收藏状态、播放次数或音频直链。

单元测试中的 `ZZAAA2600001` 等仅是 ISRC 语法/冲突测试用占位值，未声明为这些真实歌曲的录音代码，也未放入主演示歌单。
