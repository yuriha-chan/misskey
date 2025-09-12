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
				"title" text,
				"plaintext" text NOT NULL,
				"roomId" character varying NOT NULL,
				"revealsAt" timestamp with time zone,
				"revealedId" character varying,
				CONSTRAINT "PK_chat_secret_id" PRIMARY KEY ("id")
			)
		`);

		await queryRunner.query(`
			CREATE TABLE "chat_poll" (
				"id" character varying NOT NULL,
				"roomId" character varying NOT NULL,
				"ownerId" character varying NOT NULL,
				"title" text,
				"choices" character varying(256)[] NOT NULL DEFAULT '{}',
				"voteForUsers" boolean NOT NULL DEFAULT false,
				"anonymous" boolean NOT NULL DEFAULT false,
				"startsAt" timestamp with time zone,
				"startedId" character varying,
				"duration" integer,
				"finishedId" character varying,
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

		await queryRunner.query(`
			CREATE TABLE "chat_card" (
				"deliverId" character varying NOT NULL,
				"cardId" smallint NOT NULL,
				"userId" character varying NOT NULL,
				"roomId" character varying NOT NULL,
				"cardKind" character varying NOT NULL,
				"revealedId" character varying NOT NULL,
				CONSTRAINT "PK_chat_card_id" PRIMARY KEY ("deliverId", "cardId")
			)
		`);

		await queryRunner.query(`CREATE INDEX "IDX_secret_roomId" ON "chat_secret" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_secret_secretId" ON "chat_secret" ("roomId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_secret_revealedId" ON "chat_secret" ("roomId", "revealedId")`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_poll_roomId" ON "chat_poll" ("roomId")`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_poll_pollId" ON "chat_poll" ("roomId", "id")`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_poll_startedId" ON "chat_poll" ("roomId", "startedId")`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_poll_finishedId" ON "chat_poll" ("roomId", "finishedId")`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_poll_vote_pollId" ON "chat_poll_vote" ("pollId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_poll_vote_user_poll_choice" ON "chat_poll_vote" ("pollId", "choice", "userId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_user_poll_choice"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_pollId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_vote_userId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_finishedId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_startedId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_pollId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_poll_roomId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_secret_revealedId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_secret_secretId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_secret_roomId"`);
		await queryRunner.query(`DROP TABLE "chat_card"`);
		await queryRunner.query(`DROP TABLE "chat_poll_vote"`);
		await queryRunner.query(`DROP TABLE "chat_poll"`);
		await queryRunner.query(`DROP TABLE "chat_secret"`);
	}
}
