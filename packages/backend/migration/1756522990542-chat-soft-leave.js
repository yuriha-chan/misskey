/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatSoftLeave1756522990542 {
    name = 'ChatSoftLeave1756522990542'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "hasLeft" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "hasLeft"`);
    }
}
