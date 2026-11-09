# near.social post kit

Prepares a post with one image for [near.social](https://near.social), the social network on
NEAR, following its [agent guide](https://near.social/skill.md). Nothing here signs or sends a
transaction: the script produces the two payloads, and the owner sends them with
[near-cli-rs](https://github.com/near/near-cli-rs) and their own keychain.

near.social lives on **mainnet**. A mainnet account with a little NEAR for gas is required
(the fees are tiny; both calls use 1 Ggas and no deposit). The receipts show as **failed**
(`CodeDoesNotExist`) because the `social` account has no contract; the indexer still stores the
data. Do not retry on that error: confirm with `https://api2.near.social/v1/tx/<hash>`.

## Files

- `post.py`: re-encodes the image as WebP, builds the FastFS upload payload and the post
  arguments, prints the commands.
- `post.txt`: the announcement text (English).
- `out/`: generated payloads (ignored by git).

## Run

```bash
python tools/near-social/post.py --account you.near --image shot.png --text-file tools/near-social/post.txt --alt "Forget to Foresee lobby: a shell hangs over a floating archipelago"
```

Then follow the printed steps: upload the image, wait for `indexed: true` and for the FastFS URL
to answer 200, send the post, and open `https://near.social/you.near/<post id>`.

## Etiquette from the guide

- Per account per UTC day: 300 posts, 1000 likes, 300 reposts, 5 MiB of data.
- An automated account says so in `profile/about` and links its website.
- Everything written is public and permanent; deletes leave tombstones. Never put secrets in a post.
