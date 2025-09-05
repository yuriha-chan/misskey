/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddChatFeaturesTables1756522990544 {
    name = 'AddChatFeaturesTables1756522990544'

    async up(queryRunner) {
        await queryRunner.query(`
            CREATE TABLE "chat_secret" (
                "id" character varying NOT NULL,
                "userId" character varying NOT NULL,
                "plaintext" text NOT NULL,
                "revealAt" timestamp,
                "revealed" boolean NOT NULL DEFAULT false,
                CONSTRAINT "PK_chat_secret_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "chat_poll" (
                "id" character varying NOT NULL,
                "expiresAt" timestamp with time zone,
                "multiple" integer NOT NULL,
                "choices" character varying(256)[] NOT NULL DEFAULT '{}',
                "votes" integer[] NOT NULL,
                CONSTRAINT "PK_chat_poll_id" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "chat_poll_vote" (
                "id" character varying NOT NULL,
                "userId" character varying NOT NULL,
                "pollId" character varying NOT NULL,
                "choice" integer NOT NULL,
                CONSTRAINT "PK_chat_poll_vote_id" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_chat_poll_vote_userId" ON "chat_poll_vote" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_chat_poll_vote_pollId" ON "chat_poll_vote" ("pollId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_poll_vote_user_poll_choice" ON "chat_poll_vote" ("userId", "pollId", "choice")`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_user_poll_choice"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_pollId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_userId"`);
        await queryRunner.query(`DROP TABLE "chat_poll_vote"`);
        await queryRunner.query(`DROP TABLE "chat_poll"`);
        await queryRunner.query(`DROP TABLE "chat_secret"`);
    }
}
