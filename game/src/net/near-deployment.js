// Where the season-commit contract lives on NEAR testnet and which seasons were committed there.
// Written by `contracts/season-commit/scripts/write-deployment.mjs` after a deploy (docs/near.md); edit by hand
// only to point the game at another deployment. `contractId: null` disables every NEAR lookup in the game.
// Testnet only: nothing here is a key, a balance or a mainnet address.
export const NEAR_DEPLOYMENT = {
  network: "testnet",
  contractId: "ftf-seasons.testnet",
  rpcUrls: [
    "https://test.rpc.fastnear.com",
    "https://rpc.testnet.near.org"
  ],
  explorer: "https://testnet.nearblocks.io",
  seasons: {
    "793f6c05e89839f2": {
      seedHex: "cc161d308faa67539af44205b56b6d4f",
      scheduleRoot: "03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a",
      commitTx: "6TtWeZ3WuHfhAEkPa9k7mfHAs6ayxqG4iY2iJyGLahbA",
      ashKeyTx: "E3ppFxXgvtEZbJeFUsa5dstyueCF85HqiBuG9wmVWXey",
      revealTx: {
        "0": "BQo9Rb1sLBqXxcRbyiw82owYbL9f2pgTdFbp1is5ZW7G",
        "1": "EuE4iErrT1R6wXvJesAzPpANSi9odjAF5x59nw7RBrK7",
        "2": "E1BAaCAisrxfZ5tsv8GNpz5nLmosuRnWCSf8SAUJjiTB",
        "3": "FSBYd2RoirKgTuhjHBuVz3Y5YeLDQQhQfk3kQhySivGk",
        "4": "EPwSPojfpLANuEoLrsFZFt63AjejjY7HfP3rU39VUmYZ",
        "5": "GyNT7qqE4ETEDwHVhV5Rd3yjFKb311N2tt8SVYM6fDz9",
        "6": "5XQTv3L6Rn62r2H89AQzqYKUi3ZH3YtDTE94xn6ocT9T",
        "7": "69HJV7seGGrFQPGA6BBT5hpymW7aWBP1s8bVSZNjehrb",
        "8": "5LWv9soYdyVZLTS9XnHQeXAGELauYsA4dz28aScY6Jow",
        "9": "4ndqwYLNeSjkoYuu1JA2kdnCjCjBHUvsiSnmYZTw9q9o",
        "10": "GP33yvHm7VYRTmAfSjUmk8UVXNug2MVbUxJhEeBi2Tcf",
        "11": "BX5y5SdD7SsgLH9A9kuxUx5LUQjSkW6cZptgagphDNyy",
        "12": "5T6QtFxJw6aohEkjFkyw3Vvuf13Nnbm7UWZePHZG2A9e",
        "13": "5FodXX9DEnEaDFqAarZ7VNJcWh9w9xd3TJkrzhgTtpCG",
        "14": "968wtGh9VTifeNfGQwAqw2MHkn1aYe6NYburABhwqBxQ"
      }
    }
  },
  shardContractId: "ftf-shards.testnet",
  shardMints: {
    "793f6c05e89839f2": {
      "7": "2nqGqiVfk8pQaC6ue9naxR8XDYAEHXcqRZ8DovHi7LLc",
      "10": "D279h9JSGt2iZhbwnGwTHhne3pEgJikPyR4ZTVZpeJgF",
      "15": "6BpYCfy8s5zBe1w2eBBabwGx8spwLwMd7oCzNfkmN5xR"
    }
  }
};
