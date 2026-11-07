/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddBubbleStyleToChatMembership1756522990545 {
    name = 'AddBubbleStyleToChatMembership1756522990545'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "bubbleColor" character varying(64)`);
        await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD "bubbleStyle" character varying(64)`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "bubbleStyle"`);
        await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN "bubbleColor"`);
    }
}
