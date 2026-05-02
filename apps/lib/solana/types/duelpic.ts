/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/duelpic.json`.
 */
export type Duelpic = {
  address: "71PBFBGXGnYJekctFqKYAhBMgYXHpoLwhxg8CxG2pm6b";
  metadata: {
    name: "duelpic";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "claimTimeout";
      discriminator: [130, 234, 45, 53, 120, 90, 86, 178];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "session";
          writable: true;
        },
        {
          name: "claimant";
          signer: true;
        },
        {
          name: "paymentMint";
        },
        {
          name: "sessionVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "session";
              },
            ];
          };
        },
        {
          name: "sessionVault";
          writable: true;
        },
        {
          name: "claimantToken";
          writable: true;
        },
        {
          name: "treasuryToken";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "commitAnswers";
      discriminator: [162, 175, 44, 59, 113, 46, 207, 166];
      accounts: [
        {
          name: "session";
          writable: true;
        },
        {
          name: "player";
          signer: true;
        },
      ];
      args: [
        {
          name: "commitHash";
          type: {
            array: ["u8", 32];
          };
        },
      ];
    },
    {
      name: "createSession";
      discriminator: [242, 193, 143, 179, 150, 25, 122, 227];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "session";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 101, 115, 115, 105, 111, 110];
              },
              {
                kind: "arg";
                path: "sessionId";
              },
            ];
          };
        },
        {
          name: "player1";
          writable: true;
          signer: true;
        },
        {
          name: "paymentMint";
        },
        {
          name: "player1Token";
          writable: true;
        },
        {
          name: "sessionVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "session";
              },
            ];
          };
        },
        {
          name: "sessionVault";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "sessionId";
          type: {
            array: ["u8", 32];
          };
        },
        {
          name: "wager";
          type: "u64";
        },
        {
          name: "questionIds";
          type: {
            vec: "u64";
          };
        },
      ];
    },
    {
      name: "incrementDailyCount";
      discriminator: [206, 123, 65, 55, 57, 15, 221, 111];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "dailyPlay";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [100, 97, 105, 108, 121];
              },
              {
                kind: "account";
                path: "daily_play.player";
                account: "dailyPlay";
              },
              {
                kind: "account";
                path: "daily_play.day_id";
                account: "dailyPlay";
              },
            ];
          };
        },
        {
          name: "relayer";
          signer: true;
          relations: ["config"];
        },
      ];
      args: [];
    },
    {
      name: "initializeConfig";
      discriminator: [208, 127, 21, 1, 194, 190, 196, 70];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "admin";
          writable: true;
          signer: true;
        },
        {
          name: "verifier";
        },
        {
          name: "relayer";
        },
        {
          name: "treasury";
        },
        {
          name: "paymentMint";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "dailyFreeLimit";
          type: "u8";
        },
        {
          name: "casualFeeAmount";
          type: "u64";
        },
      ];
    },
    {
      name: "initializeDailyPlay";
      discriminator: [49, 145, 102, 132, 146, 193, 167, 243];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "dailyPlay";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [100, 97, 105, 108, 121];
              },
              {
                kind: "account";
                path: "player";
              },
              {
                kind: "arg";
                path: "dayId";
              },
            ];
          };
        },
        {
          name: "player";
        },
        {
          name: "relayer";
          writable: true;
          signer: true;
          relations: ["config"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "dayId";
          type: "i64";
        },
      ];
    },
    {
      name: "initializeRoyalty";
      discriminator: [240, 108, 174, 152, 126, 199, 89, 184];
      accounts: [
        {
          name: "royalty";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 111, 121, 97, 108, 116, 121];
              },
              {
                kind: "account";
                path: "contributor";
              },
            ];
          };
        },
        {
          name: "contributor";
        },
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "initializeVerifiedPool";
      discriminator: [20, 246, 91, 222, 146, 184, 238, 206];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "verifiedPool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  100,
                  95,
                  112,
                  111,
                  111,
                  108,
                ];
              },
              {
                kind: "arg";
                path: "page";
              },
            ];
          };
        },
        {
          name: "verifier";
          writable: true;
          signer: true;
          relations: ["config"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "page";
          type: "u64";
        },
      ];
    },
    {
      name: "joinSession";
      discriminator: [23, 92, 4, 160, 155, 56, 164, 253];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "session";
          writable: true;
        },
        {
          name: "player2";
          writable: true;
          signer: true;
        },
        {
          name: "paymentMint";
        },
        {
          name: "player2Token";
          writable: true;
        },
        {
          name: "sessionVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "session";
              },
            ];
          };
        },
        {
          name: "sessionVault";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
    {
      name: "payAndPlay";
      discriminator: [241, 54, 42, 36, 39, 247, 227, 22];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "player";
          writable: true;
          signer: true;
        },
        {
          name: "paymentMint";
        },
        {
          name: "playerToken";
          writable: true;
        },
        {
          name: "treasuryToken";
          writable: true;
        },
        {
          name: "royaltyVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  111,
                  121,
                  97,
                  108,
                  116,
                  121,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "royaltyVault";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "questionIds";
          type: {
            vec: "u64";
          };
        },
      ];
    },
    {
      name: "resolveByRelayer";
      discriminator: [254, 110, 212, 115, 228, 215, 33, 211];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "session";
          writable: true;
        },
        {
          name: "relayer";
          signer: true;
          relations: ["config"];
        },
        {
          name: "paymentMint";
        },
        {
          name: "player1Token";
          writable: true;
        },
        {
          name: "player2Token";
          writable: true;
        },
        {
          name: "treasuryToken";
          writable: true;
        },
        {
          name: "royaltyVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  111,
                  121,
                  97,
                  108,
                  116,
                  121,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "royaltyVault";
          writable: true;
        },
        {
          name: "sessionVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
              {
                kind: "account";
                path: "session";
              },
            ];
          };
        },
        {
          name: "sessionVault";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [
        {
          name: "winner";
          type: "pubkey";
        },
        {
          name: "score1";
          type: "u8";
        },
        {
          name: "score2";
          type: "u8";
        },
      ];
    },
    {
      name: "submitQuestion";
      discriminator: [92, 188, 40, 135, 83, 241, 178, 40];
      accounts: [
        {
          name: "config";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "question";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [113, 117, 101, 115, 116, 105, 111, 110];
              },
              {
                kind: "arg";
                path: "questionId";
              },
            ];
          };
        },
        {
          name: "contributor";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "questionId";
          type: "u64";
        },
        {
          name: "ipfsHash";
          type: "string";
        },
      ];
    },
    {
      name: "verifyQuestion";
      discriminator: [171, 252, 230, 135, 182, 213, 0, 71];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "question";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [113, 117, 101, 115, 116, 105, 111, 110];
              },
              {
                kind: "account";
                path: "question.id";
                account: "question";
              },
            ];
          };
        },
        {
          name: "verifiedPool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  118,
                  101,
                  114,
                  105,
                  102,
                  105,
                  101,
                  100,
                  95,
                  112,
                  111,
                  111,
                  108,
                ];
              },
              {
                kind: "arg";
                path: "page";
              },
            ];
          };
        },
        {
          name: "verifier";
          signer: true;
          relations: ["config"];
        },
      ];
      args: [
        {
          name: "page";
          type: "u64";
        },
      ];
    },
    {
      name: "withdrawRoyalty";
      discriminator: [205, 93, 10, 10, 48, 197, 1, 85];
      accounts: [
        {
          name: "config";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [99, 111, 110, 102, 105, 103];
              },
            ];
          };
        },
        {
          name: "royalty";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 111, 121, 97, 108, 116, 121];
              },
              {
                kind: "account";
                path: "contributor";
              },
            ];
          };
        },
        {
          name: "contributor";
          writable: true;
          signer: true;
          relations: ["royalty"];
        },
        {
          name: "paymentMint";
        },
        {
          name: "royaltyVaultAuthority";
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  111,
                  121,
                  97,
                  108,
                  116,
                  121,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                ];
              },
            ];
          };
        },
        {
          name: "royaltyVault";
          writable: true;
        },
        {
          name: "contributorToken";
          writable: true;
        },
        {
          name: "tokenProgram";
          address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        },
      ];
      args: [];
    },
  ];
  accounts: [
    {
      name: "config";
      discriminator: [155, 12, 170, 224, 30, 250, 204, 130];
    },
    {
      name: "dailyPlay";
      discriminator: [207, 20, 90, 162, 4, 235, 61, 72];
    },
    {
      name: "question";
      discriminator: [111, 22, 150, 220, 181, 122, 118, 127];
    },
    {
      name: "royalty";
      discriminator: [23, 219, 22, 85, 71, 251, 142, 75];
    },
    {
      name: "session";
      discriminator: [243, 81, 72, 115, 214, 188, 72, 144];
    },
    {
      name: "verifiedPool";
      discriminator: [1, 68, 205, 193, 171, 176, 181, 83];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "invalidDailyFreeLimit";
      msg: "Daily free limit must be greater than zero";
    },
    {
      code: 6001;
      name: "invalidFeeAmount";
      msg: "Fee amount must be greater than zero";
    },
    {
      code: 6002;
      name: "invalidQuestionId";
      msg: "Question id must equal next config question count";
    },
    {
      code: 6003;
      name: "ipfsHashTooLong";
      msg: "IPFS hash too long";
    },
    {
      code: 6004;
      name: "unauthorizedVerifier";
      msg: "Verifier authority mismatch";
    },
    {
      code: 6005;
      name: "unauthorizedRelayer";
      msg: "Relayer authority mismatch";
    },
    {
      code: 6006;
      name: "alreadyVerified";
      msg: "Question already verified";
    },
    {
      code: 6007;
      name: "invalidVerifiedPoolPage";
      msg: "Verified pool page mismatch";
    },
    {
      code: 6008;
      name: "verifiedPoolFull";
      msg: "Verified pool page is full";
    },
    {
      code: 6009;
      name: "dailyLimitExceeded";
      msg: "Daily free play limit exceeded";
    },
    {
      code: 6010;
      name: "invalidQuestionIds";
      msg: "Question ids are invalid";
    },
    {
      code: 6011;
      name: "invalidRemainingAccounts";
      msg: "Remaining accounts do not match question ids";
    },
    {
      code: 6012;
      name: "invalidQuestionAccount";
      msg: "Question account mismatch";
    },
    {
      code: 6013;
      name: "invalidRoyaltyAccount";
      msg: "Royalty account mismatch";
    },
    {
      code: 6014;
      name: "notVerified";
      msg: "Question is not verified";
    },
    {
      code: 6015;
      name: "invalidTokenAccount";
      msg: "Token account mismatch";
    },
    {
      code: 6016;
      name: "mathOverflow";
      msg: "Math overflow";
    },
    {
      code: 6017;
      name: "nothingToWithdraw";
      msg: "No royalty to withdraw";
    },
    {
      code: 6018;
      name: "invalidWager";
      msg: "Wager must be greater than zero";
    },
    {
      code: 6019;
      name: "sessionFull";
      msg: "Session is already full";
    },
    {
      code: 6020;
      name: "invalidPlayer";
      msg: "Player is invalid for this session";
    },
    {
      code: 6021;
      name: "wrongStatus";
      msg: "Session status is invalid for this instruction";
    },
    {
      code: 6022;
      name: "deadlineExceeded";
      msg: "Session deadline exceeded";
    },
    {
      code: 6023;
      name: "deadlineNotReached";
      msg: "Session deadline not reached";
    },
    {
      code: 6024;
      name: "alreadyCommitted";
      msg: "Player already committed";
    },
  ];
  types: [
    {
      name: "config";
      type: {
        kind: "struct";
        fields: [
          {
            name: "admin";
            type: "pubkey";
          },
          {
            name: "verifier";
            type: "pubkey";
          },
          {
            name: "relayer";
            type: "pubkey";
          },
          {
            name: "treasury";
            type: "pubkey";
          },
          {
            name: "paymentMint";
            type: "pubkey";
          },
          {
            name: "questionCount";
            type: "u64";
          },
          {
            name: "dailyFreeLimit";
            type: "u8";
          },
          {
            name: "casualFeeAmount";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "dailyPlay";
      type: {
        kind: "struct";
        fields: [
          {
            name: "player";
            type: "pubkey";
          },
          {
            name: "dayId";
            type: "i64";
          },
          {
            name: "count";
            type: "u8";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "question";
      type: {
        kind: "struct";
        fields: [
          {
            name: "id";
            type: "u64";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "ipfsHash";
            type: "string";
          },
          {
            name: "isVerified";
            type: "bool";
          },
          {
            name: "timesPlayed";
            type: "u64";
          },
          {
            name: "royaltyEarned";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "royalty";
      type: {
        kind: "struct";
        fields: [
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "pendingAmount";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "session";
      type: {
        kind: "struct";
        fields: [
          {
            name: "id";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "player1";
            type: "pubkey";
          },
          {
            name: "player2";
            type: "pubkey";
          },
          {
            name: "wager";
            type: "u64";
          },
          {
            name: "questionIds";
            type: {
              array: ["u64", 10];
            };
          },
          {
            name: "questionCount";
            type: "u8";
          },
          {
            name: "commitHash1";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "commitHash2";
            type: {
              array: ["u8", 32];
            };
          },
          {
            name: "score1";
            type: "u8";
          },
          {
            name: "score2";
            type: "u8";
          },
          {
            name: "status";
            type: "u8";
          },
          {
            name: "playDeadline";
            type: "i64";
          },
          {
            name: "revealDeadline";
            type: "i64";
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
    {
      name: "verifiedPool";
      type: {
        kind: "struct";
        fields: [
          {
            name: "page";
            type: "u64";
          },
          {
            name: "ids";
            type: {
              vec: "u64";
            };
          },
          {
            name: "bump";
            type: "u8";
          },
        ];
      };
    },
  ];
};
