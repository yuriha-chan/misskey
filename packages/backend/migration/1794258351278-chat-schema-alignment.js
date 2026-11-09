/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatSchemaAlignment1794258351278 {
	name = 'ChatSchemaAlignment1794258351278';

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`DELETE FROM "chat_secret" WHERE "roomId" NOT IN (SELECT "id" FROM "chat_room")`);
		await queryRunner.query(`DELETE FROM "chat_card" WHERE "roomId" NOT IN (SELECT "id" FROM "chat_room")`);
		await queryRunner.query(`DELETE FROM "chat_poll" WHERE "roomId" NOT IN (SELECT "id" FROM "chat_room")`);
		await queryRunner.query(`DELETE FROM "chat_poll_vote" WHERE "pollId" NOT IN (SELECT "id" FROM "chat_poll")`);

		await queryRunner.query(`UPDATE "chat_secret" SET "title" = '' WHERE "title" IS NULL`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "title" SET NOT NULL`);

		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "id" TYPE character varying(32) USING "id"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "userId" TYPE character varying(32) USING "userId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "roomId" TYPE character varying(32) USING "roomId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "revealedId" TYPE character varying(32) USING "revealedId"::character varying(32)`);

		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "id" TYPE character varying(32) USING "id"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "roomId" TYPE character varying(32) USING "roomId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "ownerId" TYPE character varying(32) USING "ownerId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "startedId" TYPE character varying(32) USING "startedId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "finishedId" TYPE character varying(32) USING "finishedId"::character varying(32)`);

		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "id" TYPE character varying(32) USING "id"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "userId" TYPE character varying(32) USING "userId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "pollId" TYPE character varying(32) USING "pollId"::character varying(32)`);

		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "deliverId" TYPE character varying(32) USING "deliverId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "userId" TYPE character varying(32) USING "userId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "roomId" TYPE character varying(32) USING "roomId"::character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "revealedId" TYPE character varying(32) USING "revealedId"::character varying(32)`);

		await queryRunner.query(`ALTER TABLE "chat_secret" ADD CONSTRAINT "FK_chat_secret_roomId" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ADD CONSTRAINT "FK_chat_poll_roomId" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE`);
		await queryRunner.query(`ALTER TABLE "chat_card" ADD CONSTRAINT "FK_chat_card_roomId" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE`);
		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ADD CONSTRAINT "FK_chat_poll_vote_pollId" FOREIGN KEY ("pollId") REFERENCES "chat_poll"("id") ON DELETE CASCADE`);

		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "created_on"`);
		await queryRunner.query(`ALTER TABLE "chat_room" ALTER COLUMN "theme" DROP DEFAULT`);
	}

	/**
	 * @param {QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ALTER COLUMN "theme" SET DEFAULT NULL`);
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "created_on" timestamp`);

		await queryRunner.query(`ALTER TABLE "chat_poll_vote" DROP CONSTRAINT "FK_chat_poll_vote_pollId"`);
		await queryRunner.query(`ALTER TABLE "chat_card" DROP CONSTRAINT "FK_chat_card_roomId"`);
		await queryRunner.query(`ALTER TABLE "chat_poll" DROP CONSTRAINT "FK_chat_poll_roomId"`);
		await queryRunner.query(`ALTER TABLE "chat_secret" DROP CONSTRAINT "FK_chat_secret_roomId"`);

		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "revealedId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "roomId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "userId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "id" TYPE character varying`);

		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "finishedId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "startedId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "ownerId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "roomId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll" ALTER COLUMN "id" TYPE character varying`);

		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "pollId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "userId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_poll_vote" ALTER COLUMN "id" TYPE character varying`);

		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "revealedId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "roomId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "userId" TYPE character varying`);
		await queryRunner.query(`ALTER TABLE "chat_card" ALTER COLUMN "deliverId" TYPE character varying`);

		await queryRunner.query(`ALTER TABLE "chat_secret" ALTER COLUMN "title" DROP NOT NULL`);
	}
}
