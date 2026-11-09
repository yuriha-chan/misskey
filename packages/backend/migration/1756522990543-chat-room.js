/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoom1756522990543 {
    name = 'ChatRoom1756522990543'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "capacity" integer NOT NULL DEFAULT 20`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "created_on" timestamp DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "theme" character VARYING(512) DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "expiration" integer DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "isPublic" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "capacity"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "created_on"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "theme"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "expiration"`);
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "isPublic"`);
    }
}
