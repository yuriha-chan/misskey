/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomExpirationDefault1792854844896 {
    name = 'ChatRoomExpirationDefault1792854844896';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ALTER COLUMN "expiration" SET DEFAULT 10800000');
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE "chat_room" ALTER COLUMN "expiration" SET DEFAULT 10800');
    }
};
